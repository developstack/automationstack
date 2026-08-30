/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

/**
 * 自动化上报演示的种子（`examples/{nodejs,python,jdk}` 三份示例共用的前置）。
 *
 *   pnpm db:seed-automation-demo --owner <用户名>
 *
 * `--owner` 的账号会被设成演示项目的 owner。示例走 token、不看成员资格，不给也
 * 照样能上报——但那样界面上没人看得见这个项目，而「跑完能在页面上看到结果」
 * 恰恰是这个演示的重点。项目级授权见 `packages/db/src/schema/project-members.ts`。
 *
 * 造出一整条「跑完能真的写进去」的链路，并把三份示例需要的三样环境变量原样
 * 打印出来：项目 id、token 明文、平台地址。不写死某一份示例：三份用的是
 * **同一套种子数据、同一份配置**，环境变量名三边逐字一致，跑哪一份都是这三行，
 * 不用另找一个种子脚本，同一条流水线上跑多种示例也只需要维护一套 secret。
 *
 * ⚠️ **token 明文只在创建那一刻存在**（库里只有 SHA-256，见
 * `packages/db/src/api-token.ts`），所以本脚本每跑一次就新建一枚并打印一次。
 * 这不是「不幂等」——它是那张表唯一可能的语义：明文找不回来，
 * 想要一枚能用的就只能再建一枚。项目 / 模块 / 用例 / 任务四样全是幂等的。
 *
 * 本脚本只做编排：所有 DB 访问都在 `packages/db` 的 repository 里
 * （`packages/db` 之外不得直接用 drizzle）。依赖 tsx 运行（见根 package.json），
 * cwd 为 apps/server，因此 dotenv 能自动读到 apps/server/.env 的 DATABASE_URL。
 */

import { hashPassword } from "../packages/db/src/password";
import { createApiToken } from "../packages/db/src/repositories/api-tokens-repository";
import { listTestCases } from "../packages/db/src/repositories/case-list-repository";
import { seedProject } from "../packages/db/src/repositories/seed-repository";
import { getTestRunDetail } from "../packages/db/src/repositories/test-run-detail-repository";
import { createTestRun } from "../packages/db/src/repositories/test-run-mutations-repository";
import { markTestRunReviewed } from "../packages/db/src/repositories/test-run-transitions-repository";
import { setRunCaseResult } from "../packages/db/src/repositories/test-run-verdicts-repository";
import { listTestRuns } from "../packages/db/src/repositories/test-runs-repository";
import {
	createUser,
	getUserByUsername,
} from "../packages/db/src/repositories/users-repository";
import type { User } from "../packages/db/src/schema/users";
import {
	DEMO_CASES,
	DEMO_PROJECT_NAME,
	DEMO_RUN_NAME_REGRESSION,
	DEMO_RUN_NAME_SMOKE,
	DEMO_SOURCE_REF_MANUAL,
	DEMO_SOURCE_REF_OUT_OF_SCOPE,
	DEMO_SPEC,
	REGRESSION_SOURCE_REFS,
	SMOKE_SOURCE_REFS,
} from "./seed-automation-demo-cases";
import { ARGV_OFFSET, ownerSummaryLine, resolveSeedOwner } from "./seed-owner";

/** 这枚 token 的主人。普通成员即可——ingest 的权限严格等于 token 主人。 */
const DEMO_USERNAME = "automation-demo";

/** 五条用例一页足够；写成常量是为了别让 100 变成一个没人敢改的字面量。 */
const CASE_PAGE_SIZE = 100;

const EXIT_FAILURE = 1;

/**
 * 账号只是 token 的挂靠点，口令随机生成且**不打印**：示例全程走 token，
 * 从没有一步需要登录。打印一个没人用的口令只会让人以为它是必要的。
 * 真要用界面看数据，用 `pnpm db:seed-admin` 建管理员。
 */
async function ensureDemoUser(): Promise<User> {
	const existing = await getUserByUsername(DEMO_USERNAME);
	if (existing) {
		return existing;
	}
	const created = await createUser({
		passwordHash: await hashPassword(crypto.randomUUID()),
		role: "member",
		username: DEMO_USERNAME,
	});
	if (!created) {
		throw new Error(`创建账号 ${DEMO_USERNAME} 失败：用户名刚刚被占用，请重试`);
	}
	return created;
}

/** sourceRef → caseId。归属解析只认 sourceRef，这里是它在种子侧的唯一映射。 */
async function loadCaseIdsBySourceRef(
	projectId: string
): Promise<Map<string, string>> {
	const page = await listTestCases({ pageSize: CASE_PAGE_SIZE, projectId });
	const byRef = new Map<string, string>();
	for (const item of page.items) {
		if (item.sourceRef) {
			byRef.set(item.sourceRef, item.id);
		}
	}
	return byRef;
}

function requireCaseIds(
	byRef: Map<string, string>,
	sourceRefs: string[]
): string[] {
	return sourceRefs.map((sourceRef) => {
		const caseId = byRef.get(sourceRef);
		if (!caseId) {
			throw new Error(`种子数据不完整：项目里找不到 sourceRef=${sourceRef}`);
		}
		return caseId;
	});
}

interface EnsuredRun {
	created: boolean;
	runId: string;
}

/**
 * 按**名字**复用已有任务，找不到才建。
 *
 * 幂等的落点只能是名字：`test_runs` 上没有任何业务唯一键，重复执行时
 * 除了名字没有别的东西能认出「这就是上次那个任务」。代价是有人手工改了名字
 * 就会多出一个任务，那时删掉多余的即可——比让脚本每跑一次多建一个任务好。
 */
async function findRunByName(
	projectId: string,
	name: string
): Promise<{ id: string; status: string; submitted: boolean } | null> {
	const runs = await listTestRuns(projectId, { keyword: name });
	const hit = runs.find((item) => item.run.name === name);
	if (!hit) {
		return null;
	}
	return {
		id: hit.run.id,
		status: hit.run.status,
		submitted: hit.run.submittedAt !== null,
	};
}

/**
 * 新建的任务落在 `pending_review`，而**待评审的任务不接受任何结论**（§5.8）——
 * 上报会整组进「越界」并注明「还在待评审」。所以种子必须替人把评审这一步点掉，
 * 否则示例第一次跑就是一条都写不进去，而那与「示例坏了」长得一模一样。
 */
async function ensureReviewed(runId: string, actorId: string): Promise<void> {
	const reviewed = await markTestRunReviewed({ actorId, runId });
	if (reviewed.kind === "ok" || reviewed.kind === "invalid-status") {
		return;
	}
	throw new Error(`测试任务 ${runId} 无法进入「已评审」：${reviewed.kind}`);
}

async function ensureRun(input: {
	actorId: string;
	caseIds: string[];
	name: string;
	projectId: string;
}): Promise<EnsuredRun> {
	const existing = await findRunByName(input.projectId, input.name);
	if (existing) {
		if (existing.submitted) {
			throw new Error(
				`测试任务「${input.name}」已提交并锁定，示例写不进去；请改名或删掉它再跑一次种子`
			);
		}
		await ensureReviewed(existing.id, input.actorId);
		return { created: false, runId: existing.id };
	}
	const created = await createTestRun({
		caseIds: input.caseIds,
		createdBy: input.actorId,
		description:
			"由 scripts/seed-automation-demo.ts 创建，供 examples 演示上报",
		name: input.name,
		projectId: input.projectId,
	});
	if (created.kind !== "created") {
		throw new Error(`创建测试任务「${input.name}」失败：${created.kind}`);
	}
	await ensureReviewed(created.run.id, input.actorId);
	return { created: true, runId: created.run.id };
}

/**
 * 给回归任务里的那条用例打一条**人工**结论，用来演示对账单的「跳过」一类。
 *
 * `via: "manual"` 是 D23 判据的唯一来源：`overwriteManual=false`（SDK 默认）时
 * 自动化不覆盖它，于是同一条 sourceRef 在冒烟任务里写入、在回归任务里被跳过。
 * 已经有结论就原样留着——重复执行不该把人工结论冲掉，那正是 D23 要防的事。
 */
async function ensureManualVerdict(input: {
	actorId: string;
	caseId: string;
	runId: string;
}): Promise<boolean> {
	const detail = await getTestRunDetail(input.runId);
	const target = detail?.cases.find(
		(item) => item.testCase.id === input.caseId
	);
	if (!target) {
		throw new Error(`测试任务 ${input.runId} 里找不到要打人工结论的用例`);
	}
	if (target.runCase.result !== "untested") {
		return false;
	}
	const outcome = await setRunCaseResult({
		actorId: input.actorId,
		comment: "人工已验证：导出的 xlsx 行数与页面一致",
		result: "passed",
		runCaseId: target.runCase.id,
		via: "manual",
	});
	if (outcome.kind !== "ok") {
		throw new Error(`打人工结论失败：${outcome.kind}`);
	}
	return true;
}

/**
 * 打印三份示例共用的 `.env` 三行。
 *
 * 抬头不写死某一份示例：nodejs / python / jdk 用的是**同一套种子数据、同一份配置**，
 * 环境变量名三边逐字一致，同一条流水线上跑多种示例也只需要维护一套 secret。
 */
function printEnvBlock(projectId: string, plaintext: string): void {
	console.log(
		[
			"",
			"───── examples/{nodejs,python,jdk} 共用的 .env（token 明文仅此一次可见）─────",
			"AS_BASE_URL=http://localhost:3000",
			`AS_PROJECT=${projectId}`,
			`AS_TOKEN=${plaintext}`,
			"────────────────────────────────────────────────────────────────────────────",
			"",
			"这三行对三份示例通用：三边的环境变量名逐字一致，抄到哪一份都是这三行。",
			"⚠️ 别把它们写进任何进版本库的文件（.env.example 里放占位值就行）。",
			"",
			"下一步：",
			"  pnpm --filter server dev            # 另开一个终端起服务",
			"  cd examples/<nodejs|python|jdk> && cp .env.example .env   # 把上面三行填进去",
			"",
			"  然后按各自 README 的上报命令跑：",
			"    nodejs  pnpm --filter @automationstack/example-nodejs report",
			"    python  ./.venv/bin/python -m pytest --automationstack",
			"    jdk     set -a && . ./.env && set +a && mvn test",
		].join("\n")
	);
}

async function main(): Promise<void> {
	const owner = await resolveSeedOwner(process.argv.slice(ARGV_OFFSET));
	const user = await ensureDemoUser();
	const seeded = await seedProject(DEMO_SPEC, owner?.id);
	if (seeded.errors.length > 0) {
		throw new Error(`用例写入失败：\n${seeded.errors.join("\n")}`);
	}
	const byRef = await loadCaseIdsBySourceRef(seeded.projectId);
	const regression = await ensureRun({
		actorId: user.id,
		caseIds: requireCaseIds(byRef, REGRESSION_SOURCE_REFS),
		name: DEMO_RUN_NAME_REGRESSION,
		projectId: seeded.projectId,
	});
	const smoke = await ensureRun({
		actorId: user.id,
		caseIds: requireCaseIds(byRef, SMOKE_SOURCE_REFS),
		name: DEMO_RUN_NAME_SMOKE,
		projectId: seeded.projectId,
	});
	const manualCaseId = requireCaseIds(byRef, [DEMO_SOURCE_REF_MANUAL])[0] ?? "";
	const manualWritten = await ensureManualVerdict({
		actorId: user.id,
		caseId: manualCaseId,
		runId: regression.runId,
	});
	const token = await createApiToken({
		name: `examples 演示 ${new Date().toISOString()}`,
		userId: user.id,
	});
	console.log(
		[
			`项目：${DEMO_PROJECT_NAME}（${seeded.projectId}）${seeded.projectCreated ? "，新建" : "，复用已有"}`,
			ownerSummaryLine(owner, seeded.owner),
			`用例：新建 ${seeded.casesCreated} 条，已存在跳过 ${seeded.casesSkipped} 条；共 ${DEMO_CASES.length} 条`,
			`  ${DEMO_SOURCE_REF_OUT_OF_SCOPE} 故意不勾进任何任务 → 对账单里的「越界」`,
			`测试任务：《${DEMO_RUN_NAME_REGRESSION}》（${regression.runId}）${regression.created ? "，新建" : "，复用已有"}，${REGRESSION_SOURCE_REFS.length} 条用例`,
			`测试任务：《${DEMO_RUN_NAME_SMOKE}》（${smoke.runId}）${smoke.created ? "，新建" : "，复用已有"}，${SMOKE_SOURCE_REFS.length} 条用例`,
			`人工结论：${DEMO_SOURCE_REF_MANUAL} @《${DEMO_RUN_NAME_REGRESSION}》${manualWritten ? "已打上" : "已存在，保持原样"} → 对账单里的「跳过」`,
			`token 主人：${DEMO_USERNAME}（${user.id}），token 备注名「${token.token.name}」`,
		].join("\n")
	);
	printEnvBlock(seeded.projectId, token.plaintext);
}

main()
	.then(() => process.exit(0))
	.catch((error: unknown) => {
		console.error(error);
		process.exit(EXIT_FAILURE);
	});
