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

const RUN_SUBMITTED_MESSAGE = "该测试任务已提交并锁定，不可修改";

/** 缺陷操作前的写锁检查：测试任务已作废或已提交时返回提示，可写时返回 null。 */
export function runLockMessage(run: {
	submittedAt: Date | null;
	voidedAt: Date | null;
}): string | null {
	if (run.voidedAt !== null) {
		return RUN_VOIDED_MESSAGE;
	}
	return run.submittedAt === null ? null : RUN_SUBMITTED_MESSAGE;
}

/** 写锁拒绝写入时的提示：已作废用作废的提示，已提交用锁定的提示。 */
export function rejectedWriteMessage(rejection: RunWriteLock): string {
	return rejection.kind === "voided"
		? RUN_VOIDED_MESSAGE
		: RUN_SUBMITTED_MESSAGE;
}

export const REVIEW_PENDING_MESSAGE = "该测试任务尚未评审完成，暂不能打结论";
