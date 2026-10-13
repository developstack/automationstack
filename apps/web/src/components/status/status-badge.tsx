import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import type {
	TestRunCaseResult,
	TestRunStatus,
} from "@automationstack/db/schema/test-runs";
import { cn } from "@automationstack/ui/lib/utils";
import { LockIcon } from "lucide-react";
import type { ReactNode } from "react";

import { STATUS_LABELS } from "@/components/cases/case-meta";
import {
	CASE_STATUS_TONES,
	CHANGE_TONES,
	priorityTone,
	RESULT_TONES,
	RUN_STATUS_TONES,
	STATUS_TONE_CLASSES,
	type StatusTone,
} from "@/components/status/status-badge-meta";
import {
	RESULT_ICONS,
	RESULT_LABELS,
	RUN_STATUS_LABELS,
} from "@/components/test-runs/test-run-meta";
import {
	CHANGE_KIND_LABELS,
	type ChangeKind,
} from "@/components/versions/change-kind";

export type StatusBadgeValue =
	| { kind: "caseStatus"; value: CaseStatus }
	| { kind: "change"; value: ChangeKind }
	| { kind: "priority"; value: CasePriority }
	| { kind: "result"; value: TestRunCaseResult }
	| { kind: "runStatus"; value: TestRunStatus };

export type StatusBadgeProps = StatusBadgeValue & {
	/** 替换默认图标 */
	icon?: ReactNode;
	size?: "md" | "sm";
};

const SIZE_CLASSES = {
	md: "h-6 gap-1 px-2 text-sm [&_svg]:size-4",
	sm: "h-5 gap-1 px-1.5 text-xs [&_svg]:size-3",
} as const;

interface ResolvedStatus {
	defaultIcon: ReactNode;
	label: string;
	tone: StatusTone;
}

function resolveStatus(status: StatusBadgeValue): ResolvedStatus {
	switch (status.kind) {
		case "result": {
			const Icon = RESULT_ICONS[status.value];
			return {
				defaultIcon: <Icon aria-hidden="true" />,
				label: RESULT_LABELS[status.value],
				tone: RESULT_TONES[status.value],
			};
		}
		case "runStatus":
			return {
				defaultIcon:
					status.value === "submitted" ? <LockIcon aria-hidden="true" /> : null,
				label: RUN_STATUS_LABELS[status.value],
				tone: RUN_STATUS_TONES[status.value],
			};
		case "change":
			return {
				defaultIcon: null,
				label: CHANGE_KIND_LABELS[status.value],
				tone: CHANGE_TONES[status.value],
			};
		case "caseStatus":
			return {
				defaultIcon: null,
				label: STATUS_LABELS[status.value],
				tone: CASE_STATUS_TONES[status.value],
			};
		default:
			return {
				defaultIcon: null,
				label: status.value,
				tone: priorityTone(status.value),
			};
	}
}

/** 执行结果、测试任务状态、用例状态、优先级和版本对比中变化的统一标签。颜色只表示状态，每个标签都显示文字。 */
export function StatusBadge({
	icon,
	size = "sm",
	...status
}: StatusBadgeProps) {
	const { defaultIcon, label, tone } = resolveStatus(status);
	return (
		<span
			className={cn(
				"inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-md border border-transparent font-medium [&_svg]:shrink-0",
				SIZE_CLASSES[size],
				STATUS_TONE_CLASSES[tone]
			)}
			data-status={status.value}
			data-tone={tone}
		>
			{icon ?? defaultIcon}
			{label}
		</span>
	);
}
