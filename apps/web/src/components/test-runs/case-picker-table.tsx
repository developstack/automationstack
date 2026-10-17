import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Checkbox } from "@automationstack/ui/components/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { useCallback } from "react";

import type { PageSelectionState } from "@/components/interaction/page-selection";
import { SelectPageCheckbox } from "@/components/interaction/select-page-checkbox";
import { StatusBadge } from "@/components/status/status-badge";

interface PickerRowProps {
	onToggle: (caseId: string) => void;
	selected: boolean;
	testCase: TestCase;
}

function PickerRow({ onToggle, selected, testCase }: PickerRowProps) {
	const handleToggle = useCallback(
		() => onToggle(testCase.id),
		[onToggle, testCase.id]
	);

	return (
		<TableRow aria-selected={selected}>
			<TableCell className="w-8">
				<Checkbox
					aria-label={`选择用例「${testCase.name}」`}
					checked={selected}
					onCheckedChange={handleToggle}
				/>
			</TableCell>
			<TableCell className="font-medium">{testCase.name}</TableCell>
			<TableCell className="w-16">
				<StatusBadge kind="priority" value={testCase.priority} />
			</TableCell>
			<TableCell className="w-20">
				<StatusBadge kind="caseStatus" value={testCase.status} />
			</TableCell>
		</TableRow>
	);
}

interface CasePickerTableProps {
	cases: TestCase[];
	onToggle: (caseId: string) => void;
	onTogglePage: () => void;
	pageState: PageSelectionState;
	selectedIds: ReadonlySet<string>;
}

export function CasePickerTable({
	cases,
	onToggle,
	onTogglePage,
	pageState,
	selectedIds,
}: CasePickerTableProps) {
	if (cases.length === 0) {
		return (
			<p className="px-2 py-8 text-center text-muted-foreground text-sm">
				当前范围下没有用例，换个模块或清掉筛选条件试试。
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-8">
						<SelectPageCheckbox
							label="全选本页用例"
							onToggle={onTogglePage}
							state={pageState}
						/>
					</TableHead>
					<TableHead>名称</TableHead>
					<TableHead className="w-16">优先级</TableHead>
					<TableHead className="w-20">状态</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{cases.map((testCase) => (
					<PickerRow
						key={testCase.id}
						onToggle={onToggle}
						selected={selectedIds.has(testCase.id)}
						testCase={testCase}
					/>
				))}
			</TableBody>
		</Table>
	);
}
