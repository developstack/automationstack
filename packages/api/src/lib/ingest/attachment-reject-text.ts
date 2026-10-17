import type { RunWriteLock } from "@automationstack/db/repositories/test-run-status-core";

export const REASON_STORAGE_UNCONFIGURED =
	"附件存储（R2）未配置，本轮附件未上传；结论已照常写入";

function nameRun(runName: string | null): string {
	return runName === null ? "该测试任务" : `测试任务「${runName}」`;
}

export function describeRunCaseVanished(runName: string | null): string {
	return `${nameRun(runName)}的用例范围被改动，这条用例行已不在其中，请重跑`;
}

export function describeRunUnwritable(
	rejection: RunWriteLock | { kind: "not-found" },
	runName: string | null
): string {
	if (rejection.kind === "voided") {
		return `${nameRun(runName)}已作废，附件未受理`;
	}
	if (rejection.kind === "locked") {
		return `${nameRun(runName)}已于 ${rejection.submittedAt.toLocaleString("zh-CN")} 提交并锁定，附件未受理`;
	}
	return `${nameRun(runName)}已不存在，附件未受理`;
}
