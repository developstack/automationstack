import type {
	ConnectionStep,
	ConnectionStepStatus,
	ConnectionTestResult,
} from "@automationstack/api/auth/casdoor/test-connection";
import { ORPCError } from "@orpc/client";

/** 测试连接的结果来自哪里：「测试连接」按钮，或者保存时服务端的测试。 */
export type ConnectionChecksSource = "save" | "test";

export interface ConnectionChecks extends ConnectionTestResult {
	source: ConnectionChecksSource;
	testedAt: Date | null;
}

type BadgeVariant = "default" | "destructive" | "outline";

export const STEP_STATUS_LABELS: Record<ConnectionStepStatus, string> = {
	failed: "失败",
	passed: "通过",
	skipped: "跳过",
};

export const STEP_STATUS_BADGES: Record<ConnectionStepStatus, BadgeVariant> = {
	failed: "destructive",
	passed: "default",
	skipped: "outline",
};

/** 结果列表上方的一句话总结。屏幕阅读器通过 aria-live 读出它。 */
export function connectionChecksSummary(checks: ConnectionChecks): string {
	const failed = checks.steps.filter((step) => step.status === "failed").length;
	if (checks.ok) {
		return checks.source === "save"
			? "保存前的测试连接全部通过。"
			: "测试连接全部通过。";
	}
	const prefix =
		checks.source === "save"
			? "保存前的测试连接没有通过，没有保存"
			: "测试连接没有通过";
	return failed > 0 ? `${prefix}：${failed} 步失败。` : `${prefix}。`;
}

const STEP_IDS = new Set(["adminRole", "discovery", "organization", "token"]);
const STEP_STATUSES = new Set(["failed", "passed", "skipped"]);

function isConnectionStep(value: unknown): value is ConnectionStep {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const step = value as Record<string, unknown>;
	return (
		STEP_IDS.has(String(step.id)) &&
		STEP_STATUSES.has(String(step.status)) &&
		typeof step.label === "string" &&
		(step.detail === null || typeof step.detail === "string")
	);
}

/** CONNECTION_TEST_FAILED 错误的 data。形状不对时返回 null。 */
export function connectionTestResultOf(
	data: unknown
): ConnectionTestResult | null {
	if (typeof data !== "object" || data === null) {
		return null;
	}
	const { ok, steps } = data as Record<string, unknown>;
	if (typeof ok !== "boolean" || !Array.isArray(steps)) {
		return null;
	}
	return steps.every(isConnectionStep) ? { ok, steps } : null;
}

export type AuthSettingsSaveProblem =
	| { kind: "invalid"; message: string }
	| { kind: "other"; message: string }
	| { kind: "precondition"; message: string }
	| { kind: "test-failed"; message: string; result: ConnectionTestResult };

/** 把保存认证设置的错误分为页面上的几种显示方式。 */
export function authSettingsSaveProblemOf(
	error: unknown
): AuthSettingsSaveProblem {
	const message = error instanceof Error ? error.message : String(error);
	if (!(error instanceof ORPCError)) {
		return { kind: "other", message };
	}
	if (error.code === "CONNECTION_TEST_FAILED") {
		const result = connectionTestResultOf(error.data);
		return result === null
			? { kind: "other", message }
			: { kind: "test-failed", message, result };
	}
	if (error.code === "PRECONDITION_FAILED") {
		return { kind: "precondition", message };
	}
	if (error.code === "BAD_REQUEST") {
		return { kind: "invalid", message };
	}
	return { kind: "other", message };
}

export const SAVE_PROBLEM_TITLES: Record<
	AuthSettingsSaveProblem["kind"],
	string
> = {
	invalid: "请检查填写的内容",
	other: "保存失败",
	precondition: "现在不能保存",
	"test-failed": "测试连接没有通过",
};
