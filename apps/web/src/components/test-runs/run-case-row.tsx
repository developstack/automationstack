import { Badge } from "@automationstack/ui/components/badge";
import { Checkbox } from "@automationstack/ui/components/checkbox";
import { cn } from "@automationstack/ui/lib/utils";
import { UserIcon } from "lucide-react";
import { useCallback } from "react";

import { CaseCollaboratorsCell } from "@/components/cases/case-collaborators-cell";
import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import {
	RESULT_ICONS,
	RESULT_LABELS,
	RESULT_TEXT_CLASSES,
} from "@/components/test-runs/test-run-meta";
import type { CaseCollaborators } from "@/realtime/use-editing";

function RunCaseRowContent({
	item,
	onSelect,
	selected,
}: {
	item: RunCaseDetail;
	onSelect: () => void;
	selected: boolean;
}) {
	const { runCase, testCase } = item;
	const Icon = RESULT_ICONS[runCase.result];

	return (
		<button
			aria-current={selected ? "true" : undefined}
			className={cn(
				"flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
				selected && "bg-accent"
			)}
			onClick={onSelect}
			type="button"
		>
			<Icon
				aria-hidden="true"
				className={cn(
					"icon-stroke-regular size-4 shrink-0",
					RESULT_TEXT_CLASSES[runCase.result]
				)}
			/>
			<span className="sr-only">{RESULT_LABELS[runCase.result]}</span>
			<span className="min-w-0 flex-1 truncate">{testCase.name}</span>
			<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
				{testCase.priority}
			</Badge>
			{runCase.assigneeId !== null && (
				<UserIcon
					aria-hidden="true"
					className="icon-stroke-regular size-3 text-muted-foreground"
				/>
			)}
		</button>
	);
}

export interface RunCaseRowProps {
	checked: boolean;
	collaborators: CaseCollaborators | undefined;
	item: RunCaseDetail;
	onSelect: (runCaseId: string) => void;
	onToggleChecked: (runCaseId: string) => void;
	selectable: boolean;
	selected: boolean;
}

export function RunCaseRow({
	checked,
	collaborators,
	item,
	onSelect,
	onToggleChecked,
	selectable,
	selected,
}: RunCaseRowProps) {
	const { runCase, testCase } = item;
	const handleSelect = useCallback(
		() => onSelect(runCase.id),
		[onSelect, runCase.id]
	);
	const handleToggle = useCallback(
		() => onToggleChecked(runCase.id),
		[onToggleChecked, runCase.id]
	);

	return (
		<li className="flex items-center gap-2 px-2">
			{selectable ? (
				<Checkbox
					aria-label={`选择用例 ${testCase.name}`}
					checked={checked}
					onCheckedChange={handleToggle}
				/>
			) : null}
			<RunCaseRowContent
				item={item}
				onSelect={handleSelect}
				selected={selected}
			/>
			{collaborators ? (
				<CaseCollaboratorsCell collaborators={collaborators} />
			) : null}
		</li>
	);
}
