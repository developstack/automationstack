import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { type MouseEvent, useCallback } from "react";

import { STATUS_LABELS, STATUS_LIFECYCLE } from "@/components/cases/case-meta";
import { StatusBadge } from "@/components/status/status-badge";

interface CaseStatusPickerProps {
	caseName: string;
	onChange: (status: CaseStatus) => void;
	status: CaseStatus;
}

// 菜单在 Portal 中，但 React 事件仍然沿组件树冒泡。点击停在选择器，所在的行和表格收不到，不会当作选中用例
const stopAtPicker = (event: MouseEvent) => event.stopPropagation();

/** 用例表格中的状态标签。点击后选择草稿、生效或废弃，选中后立刻修改。 */
export function CaseStatusPicker({
	caseName,
	onChange,
	status,
}: CaseStatusPickerProps) {
	const handleValueChange = useCallback(
		(value: unknown) => {
			const next = STATUS_LIFECYCLE.find((option) => option === value);
			if (next !== undefined && next !== status) {
				onChange(next);
			}
		},
		[onChange, status]
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`修改用例「${caseName}」的状态，当前为${STATUS_LABELS[status]}`}
				className="flex cursor-pointer rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
				onClick={stopAtPicker}
			>
				<StatusBadge kind="caseStatus" value={status} />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-28" onClick={stopAtPicker}>
				<DropdownMenuRadioGroup
					onValueChange={handleValueChange}
					value={status}
				>
					{STATUS_LIFECYCLE.map((option) => (
						<DropdownMenuRadioItem closeOnClick key={option} value={option}>
							{STATUS_LABELS[option]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
