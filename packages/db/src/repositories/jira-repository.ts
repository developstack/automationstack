import { count, eq } from "drizzle-orm";

import { db } from "../index";
import { type JiraConfig, jiraConfigs } from "../schema/integrations";
import { type CaseStep, testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import {
	type TestRunCaseResult,
	testRunCases,
	testRuns,
} from "../schema/test-runs";

/**
 * Jira 接入的数据访问层。
 *
 * 本仓库**只搬运密文，不认识明文**——加解密发生在
 * `packages/api/src/lib/jira/get-client.ts`（与 AI provider 配置把加解密放在
 * `packages/ai/src/config-store.ts` 的分工一致）。这样「明文 API Token 出现在
 * 哪些调用栈里」是可枚举的，审计时不必读整个 db 包。
 *
 * 缺陷字段的**写入**不在这里：正向创建与反向关联走
 * `test-run-defects-repository.ts` 的 `setRunCaseDefect`（内含 submitted 守卫），
 * webhook 走同一文件的 `updateDefectStatusByIssueKey`（故意绕过守卫，理由见 plan §2.5）。
 * 本文件只提供组装 issue 正文所需的**只读**上下文。
 */

/** 读取项目的 Jira 配置；**没有行 = 未配置**（D9），返回 null 而不是抛异常。 */
export async function getJiraConfig(
	projectId: string
): Promise<JiraConfig | null> {
	const [row] = await db
		.select()
		.from(jiraConfigs)
		.where(eq(jiraConfigs.projectId, projectId))
		.limit(1);
	return row ?? null;
}

export interface UpsertJiraConfigInput {
	/**
	 * 三态里的两态：
	 * - `undefined`：保持库里已有的密文不动（用户编辑其他字段、没重填 Token）；
	 * - 字符串：新的密文，覆盖旧值。
	 *
	 * 没有「显式清空」这一态：`api_token_cipher` 是 notNull，没有 Token 的
	 * Jira 配置连自检都调不通，等于半吊子状态。要撤销就删整行（`removeJiraConfig`），
	 * 那也正是「未配置」的唯一表示法。
	 */
	apiTokenCipher?: string;
	defaultIssueType: string;
	email: string;
	projectId: string;
	projectKey: string;
	siteUrl: string;
	updatedBy: string | null;
	/**
	 * 三态：`undefined` 保持不动、`null` 显式清空（关掉状态同步）、字符串覆盖。
	 * 与 Token 不同，这里允许清空——可空正是「只用正向创建、不开 webhook」的表示法。
	 */
	webhookSecret?: string | null;
}

/**
 * `token-required` 不是错误而是业务分支：首次配置必须给 Token，
 * 而「留空 = 不修改」的语义又要求空值合法。二者只在「没有已存行」时冲突。
 */
export type UpsertJiraConfigResult =
	| { kind: "ok"; row: JiraConfig }
	| { kind: "token-required" };

function buildUpdateSet(
	input: UpsertJiraConfigInput
): Record<string, string | null> {
	const patch: Record<string, string | null> = {
		defaultIssueType: input.defaultIssueType,
		email: input.email,
		projectKey: input.projectKey,
		siteUrl: input.siteUrl,
		updatedBy: input.updatedBy,
	};
	// 键存在即写，包括显式的 null；键不存在则完全不出现在 SET 子句里——
	// 这正是「留空表示不修改」，而不是回写一个掩码占位串（那会把掩码存成真 Token）。
	if (input.apiTokenCipher !== undefined) {
		patch.apiTokenCipher = input.apiTokenCipher;
	}
	if (input.webhookSecret !== undefined) {
		patch.webhookSecret = input.webhookSecret;
	}
	return patch;
}

/**
 * 写入项目的 Jira 配置。
 *
 * 分两条路径而不是先 select 再决定 insert/update：
 * - 带新 Token：一条 upsert，冲突时由 `jira_configs_project_id_uq` 仲裁，
 *   两个管理员同时保存也插不出第二行；
 * - 不带 Token：一条 `UPDATE ... WHERE project_id = ?`，更新 0 行即说明
 *   「还没配过却也没给 Token」，返回 `token-required`。
 *
 * 后者用 UPDATE 的返回行数当存在性判据，因此天然没有 TOCTOU：
 * 不存在「先查到有行、插入前被别人删掉」的窗口。
 */
export async function upsertJiraConfig(
	input: UpsertJiraConfigInput
): Promise<UpsertJiraConfigResult> {
	const cipher = input.apiTokenCipher;
	if (cipher === undefined) {
		const [updated] = await db
			.update(jiraConfigs)
			.set(buildUpdateSet(input))
			.where(eq(jiraConfigs.projectId, input.projectId))
			.returning();
		return updated ? { kind: "ok", row: updated } : { kind: "token-required" };
	}
	const [row] = await db
		.insert(jiraConfigs)
		.values({
			apiTokenCipher: cipher,
			defaultIssueType: input.defaultIssueType,
			email: input.email,
			projectId: input.projectId,
			projectKey: input.projectKey,
			siteUrl: input.siteUrl,
			updatedBy: input.updatedBy,
			webhookSecret: input.webhookSecret ?? null,
		})
		.onConflictDoUpdate({
			set: buildUpdateSet(input),
			target: jiraConfigs.projectId,
		})
		.returning();
	if (!row) {
		throw new Error("upsertJiraConfig: upsert returned no row");
	}
	return { kind: "ok", row };
}

/**
 * 删除项目的 Jira 配置，返回是否真的删掉了一行。
 *
 * 删行就是「回到未配置」：之后 `getJiraClient` 返回 null，所有 Jira 能力
 * 自动退化成纯文本 URL 输入（D9）。已经写在 `test_run_cases` 上的
 * defectKey / defectUrl / defectStatus **不清理**——那是历史事实，
 * 断开接入不该把已经记录的缺陷关联抹掉。
 */
export async function removeJiraConfig(projectId: string): Promise<boolean> {
	const removed = await db
		.delete(jiraConfigs)
		.where(eq(jiraConfigs.projectId, projectId))
		.returning({ id: jiraConfigs.id });
	return removed.length > 0;
}

/**
 * 组装 Jira issue 正文所需的只读上下文，一次查询取齐。
 *
 * 用例内容按 `caseId` 实时 join（D2 活引用），因此这里拿到的永远是最新版
 * ——与执行台看到的一致。
 */
export interface DefectContext {
	/**
	 * 附件张数。**不返回 R2 的 key 或链接**：签名 GET URL 15 分钟就过期，
	 * 写进 Jira 描述里的外链几分钟后就是死链，比不给链接更糟（plan §5.2）。
	 * 描述里只写「附件 N 个」并给出平台回链。
	 */
	attachmentCount: number;
	caseName: string;
	casePreconditions: string | null;
	caseSteps: CaseStep[];
	/** 失败原因 / 阻塞原因，由执行人填写。 */
	comment: string | null;
	/** 已关联的 issue key；非空说明这条用例已经有缺陷了，不该再建第二个。 */
	defectKey: string | null;
	projectId: string;
	result: TestRunCaseResult;
	runId: string;
	runName: string;
	/**
	 * 测试任务是否已提交锁死。
	 *
	 * ⚠️ 这**不是**权威守卫——权威守卫在 `setRunCaseDefect` 的事务里
	 * （plan §4.2 明令禁止在 router 里先查再改）。这里读它只为一件事：
	 * 在已锁死的测试任务上点「创建 Jira Issue」必定会被写回环节拒绝，
	 * 若不提前止损，就会在 Jira 里留下一个没人关联、也没人知道的孤儿 issue。
	 * 外部副作用不可回滚，所以宁可多读一次。竞态窗口内（读到未提交、
	 * 建完 issue 时已提交）仍以事务里的守卫为准，代价只是那一个孤儿 issue。
	 */
	submittedAt: Date | null;
}

export async function getDefectContext(
	runCaseId: string
): Promise<DefectContext | null> {
	const [row] = await db
		.select({
			caseName: testCases.name,
			casePreconditions: testCases.preconditions,
			caseSteps: testCases.steps,
			comment: testRunCases.comment,
			defectKey: testRunCases.defectKey,
			projectId: testRuns.projectId,
			result: testRunCases.result,
			runId: testRuns.id,
			runName: testRuns.name,
			submittedAt: testRuns.submittedAt,
		})
		.from(testRunCases)
		.innerJoin(testRuns, eq(testRuns.id, testRunCases.runId))
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	if (!row) {
		return null;
	}
	const [attachments] = await db
		.select({ value: count() })
		.from(testRunAttachments)
		.where(eq(testRunAttachments.runCaseId, runCaseId));
	return { ...row, attachmentCount: attachments?.value ?? 0 };
}
