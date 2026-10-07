/** biome-ignore-all lint/suspicious/noConsole: 种子脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

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

const DEMO_USERNAME = "automation-demo";

const CASE_PAGE_SIZE = 100;

const EXIT_FAILURE = 1;

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
