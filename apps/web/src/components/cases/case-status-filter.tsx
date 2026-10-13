import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@automationstack/ui/components/toggle-group";
import { useCallback } from "react";

import { STATUS_LABELS } from "@/components/cases/case-meta";

const ALL_STATUS = "all";

type StatusFilterValue = CaseStatus | typeof ALL_STATUS;

// 按用例状态的生命周期排列：草稿、生效、废弃
const STATUS_FILTER_OPTIONS: readonly {
	label: string;
	value: StatusFilterValue;
}[] = [
	{ label: "全部", value: ALL_STATUS },
	{ label: STATUS_LABELS.draft, value: "draft" },
	{ label: STATUS_LABELS.active, value: "active" },
	{ label: STATUS_LABELS.deprecated, value: "deprecated" },
];

function statusFromGroupValue(
	groupValue: readonly string[]
): CaseStatus | undefined {
	const next = STATUS_FILTER_OPTIONS.find(
		(option) => option.value === groupValue[0]
	)?.value;
	return next === undefined || next === ALL_STATUS ? undefined : next;
}

interface CaseStatusFilterProps {
	onChange: (status: CaseStatus | undefined) => void;
	status: CaseStatus | undefined;
}

/** 分段按钮，一次只按一个用例状态筛选。再次点击已按下的状态，回到「全部」。 */
export function CaseStatusFilter({ onChange, status }: CaseStatusFilterProps) {
	const handleValueChange = useCallback(
		(groupValue: string[]) => onChange(statusFromGroupValue(groupValue)),
		[onChange]
	);

	return (
		<ToggleGroup
			aria-label="按状态筛选"
			onValueChange={handleValueChange}
			size="sm"
			value={[status ?? ALL_STATUS]}
			variant="segmented"
		>
			{STATUS_FILTER_OPTIONS.map((option) => (
				<ToggleGroupItem key={option.value} value={option.value}>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
