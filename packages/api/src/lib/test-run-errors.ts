import type { RunWriteLock } from "@automationstack/db/repositories/test-run-status-core";

export const testRunErrors = {
	BAD_REQUEST: {},
	CONFLICT: {},
	NOT_FOUND: {},
} as const;

export interface TestRunErrorThrowers {
	BAD_REQUEST: (options?: { message?: string }) => Error;
	CONFLICT: (options?: { message?: string }) => Error;
	NOT_FOUND: (options?: { message?: string }) => Error;
}

export type RunWriteRejection = RunWriteLock | { kind: "not-found" };

export const RUN_VOIDED_MESSAGE = "测试任务已作废，不能修改";

export function isRunWriteLock(
	rejection: RunWriteRejection
): rejection is RunWriteLock {
	return rejection.kind === "locked" || rejection.kind === "voided";
}

export function rejectRunWrite(
	rejection: RunWriteRejection,
	errors: TestRunErrorThrowers
): never {
	if (rejection.kind === "voided") {
		throw errors.CONFLICT({ message: RUN_VOIDED_MESSAGE });
	}
	if (rejection.kind === "locked") {
		throw errors.CONFLICT({
			message: `该测试任务已于 ${rejection.submittedAt.toLocaleString("zh-CN")} 提交并锁定，不可修改`,
		});
	}
	throw errors.NOT_FOUND({ message: "测试任务不存在" });
}

export const REVIEW_PENDING_MESSAGE = "该测试任务尚未评审完成，暂不能打结论";
