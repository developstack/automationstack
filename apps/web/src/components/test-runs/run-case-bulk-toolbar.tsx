import { Button } from "@automationstack/ui/components/button";
import { CircleCheckIcon, PlusIcon, Trash2Icon } from "lucide-react";

function VerdictActions({
	allChecked,
	bulkPassBlocked,
	nothingChecked,
	onAssignToMe,
	onBulkPass,
	onToggleAll,
}: {
	allChecked: boolean;
	bulkPassBlocked: boolean;
	nothingChecked: boolean;
	onAssignToMe: () => void;
	onBulkPass: () => void;
	onToggleAll: () => void;
}) {
	return (
		<>
			<Button onClick={onToggleAll} size="sm" type="button" variant="ghost">
				{allChecked ? "取消全选" : "全选"}
			</Button>
			<Button
				aria-disabled={bulkPassBlocked || undefined}
				onClick={bulkPassBlocked ? undefined : onBulkPass}
				size="sm"
				type="button"
				variant="ghost"
			>
				<CircleCheckIcon aria-hidden="true" data-icon="inline-start" />
				一键通过
			</Button>
			<Button
				aria-disabled={nothingChecked || undefined}
				onClick={nothingChecked ? undefined : onAssignToMe}
				size="sm"
				type="button"
				variant="ghost"
			>
				指派给我
			</Button>
		</>
	);
}

function EditCaseActions({
	canEditCases,
	nothingChecked,
	onAddCases,
	onRemoveCases,
}: {
	canEditCases: boolean;
	nothingChecked: boolean;
	onAddCases: () => void;
	onRemoveCases: () => void;
}) {
	if (!canEditCases) {
		return null;
	}

	return (
		<>
			<Button
				aria-disabled={nothingChecked || undefined}
				onClick={nothingChecked ? undefined : onRemoveCases}
				size="sm"
				type="button"
				variant="ghost"
			>
				<Trash2Icon aria-hidden="true" data-icon="inline-start" />
				移出
			</Button>
			<Button onClick={onAddCases} size="sm" type="button" variant="ghost">
				<PlusIcon aria-hidden="true" data-icon="inline-start" />
				追加用例
			</Button>
		</>
	);
}

export interface BulkToolbarProps {
	canConclude: boolean;
	canEditCases: boolean;
	checkedCount: number;
	onAddCases: () => void;
	onAssignToMe: () => void;
	onBulkPass: () => void;
	onRemoveCases: () => void;
	onToggleAll: () => void;
	visibleCount: number;
}

export function BulkToolbar({
	canConclude,
	canEditCases,
	checkedCount,
	onAddCases,
	onAssignToMe,
	onBulkPass,
	onRemoveCases,
	onToggleAll,
	visibleCount,
}: BulkToolbarProps) {
	if (!(canConclude || canEditCases)) {
		return null;
	}

	const nothingChecked = checkedCount === 0;
	const allChecked = checkedCount === visibleCount && visibleCount > 0;
	const bulkPassBlocked = nothingChecked || !canConclude;

	return (
		<div className="flex flex-wrap items-center gap-1 px-2">
			<VerdictActions
				allChecked={allChecked}
				bulkPassBlocked={bulkPassBlocked}
				nothingChecked={nothingChecked}
				onAssignToMe={onAssignToMe}
				onBulkPass={onBulkPass}
				onToggleAll={onToggleAll}
			/>
			<EditCaseActions
				canEditCases={canEditCases}
				nothingChecked={nothingChecked}
				onAddCases={onAddCases}
				onRemoveCases={onRemoveCases}
			/>
			{checkedCount > 0 ? (
				<span className="ml-auto text-muted-foreground text-xs">
					已选 {checkedCount} 条
				</span>
			) : null}
		</div>
	);
}
