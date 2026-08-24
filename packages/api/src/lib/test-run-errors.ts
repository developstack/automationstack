import type { RunLocked } from "@automationstack/db/repositories/test-run-status-core";

/** 测试任务路由共用的错误码集合。 */
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

/** 所有写路径共有的两种拒绝，由 repository 在事务内判定后返回。 */
export type RunWriteRejection = RunLocked | { kind: "not-found" };

/**
 * 把 repository 的类型化拒绝翻成 oRPC 错误。
 *
 * 「已提交」用 CONFLICT 而不是 FORBIDDEN：这不是权限问题——同一个人五分钟前
 * 完全有权改这条，是测试任务的状态变了。前端据此提示「刷新看看」而不是「你没权限」。
 */
export function rejectRunWrite(
	rejection: RunWriteRejection,
	errors: TestRunErrorThrowers
): never {
	if (rejection.kind === "locked") {
		throw errors.CONFLICT({
			message: `该测试任务已于 ${rejection.submittedAt.toLocaleString("zh-CN")} 提交并锁定，不可修改`,
		});
	}
	throw errors.NOT_FOUND({ message: "测试任务不存在" });
}
