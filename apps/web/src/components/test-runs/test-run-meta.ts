import type {
	TestRunCaseResult,
	TestRunStatus,
	TestRunStepResult,
} from "@automationstack/db/schema/test-runs";
import {
	CircleCheckIcon,
	CircleDashedIcon,
	CircleMinusIcon,
	CircleSlashIcon,
	CircleXIcon,
	type LucideIcon,
} from "lucide-react";

import { isTestRunLocked } from "@/components/test-runs/test-run-rates";

export const RUN_STATUS_LABELS: Record<TestRunStatus, string> = {
	completed: "已完成",
	in_progress: "测试中",
	pending_review: "待评审",
	ready: "待测试",
	submitted: "已提交",
	voided: "已作废",
};

/** 状态筛选的默认选项。不选状态时列表不显示已作废的测试任务，所以名称写明不含已作废。 */
export const DEFAULT_RUN_STATUS_FILTER_LABEL = `全部（不含${RUN_STATUS_LABELS.voided}）`;

export const RESULT_LABELS: Record<TestRunCaseResult, string> = {
	blocked: "阻塞",
	failed: "失败",
	passed: "通过",
	skipped: "跳过",
	untested: "未测",
};

export const RESULT_ICONS: Record<TestRunCaseResult, LucideIcon> = {
	blocked: CircleSlashIcon,
	failed: CircleXIcon,
	passed: CircleCheckIcon,
	skipped: CircleMinusIcon,
	untested: CircleDashedIcon,
};

export const RESULT_TEXT_CLASSES: Record<TestRunCaseResult, string> = {
	blocked: "text-warning",
	failed: "text-destructive",
	passed: "text-success",
	skipped: "text-muted-foreground",
	untested: "text-muted-foreground",
};

export const RESULT_ORDER: readonly TestRunCaseResult[] = [
	"untested",
	"passed",
	"failed",
	"blocked",
	"skipped",
];

export const VERDICT_VALUES: readonly TestRunCaseResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
];

export const STEP_VERDICT_VALUES: readonly TestRunStepResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
];

export const VERDICT_SHORTCUT_KEYS: Record<TestRunCaseResult, string> = {
	blocked: "B",
	failed: "F",
	passed: "P",
	skipped: "S",
	untested: "",
};

export function needsVerdictDetails(result: TestRunCaseResult): boolean {
	return result === "failed" || result === "blocked";
}

export interface CommentFieldText {
	label: string;
	placeholder?: string;
}

/** 用例说明的标签和提示。有步骤的用例，说明由失败和阻塞步骤的实际结果汇总而成。 */
export function commentFieldText(result: TestRunCaseResult): CommentFieldText {
	if (result === "failed") {
		return {
			label: "说明",
			placeholder: "写清楚复现路径和实际结果，这段会带进测试报告里",
		};
	}
	if (result === "blocked") {
		return {
			label: "说明",
			placeholder: "写清楚卡在哪一步、缺什么环境或数据，解开后才知道从哪接着测",
		};
	}
	return { label: "说明" };
}

export interface RunPermissions {
	canConclude: boolean;
	canEditCases: boolean;
	locked: boolean;
}

export function runPermissions(status: TestRunStatus): RunPermissions {
	// 已提交和已作废的测试任务只读，服务端也拒绝一切写操作。
	if (isTestRunLocked(status)) {
		return { canConclude: false, canEditCases: false, locked: true };
	}
	return {
		canConclude: status !== "pending_review",
		canEditCases: true,
		locked: false,
	};
}

export type ResultCounts = Record<TestRunCaseResult, number>;

export function emptyResultCounts(): ResultCounts {
	return { blocked: 0, failed: 0, passed: 0, skipped: 0, untested: 0 };
}

export function countResults(
	results: readonly TestRunCaseResult[]
): ResultCounts {
	const counts = emptyResultCounts();
	for (const result of results) {
		counts[result] += 1;
	}
	return counts;
}
