/**
 * 执行台左栏的批量操作条。
 *
 * 早先它就已经从 `RunCaseList` 里抽成了一个函数，理由是把那个组件的认知复杂度
 * 压回阈值内、顺带让「哪些按钮依赖勾选数」集中在一处。现在连文件也分开——
 * `run-case-list.tsx` 超了仓库 300 行的上限，而这一块本来就是独立的一段。
 *
 * 禁用一律用 `aria-disabled` + 不挂 onClick，而不是 `disabled`：原生 disabled
 * 的按钮拿不到焦点，读屏用户 Tab 过去时它直接消失，没人知道这里本来有个操作。
 */
import { Button } from "@automationstack/ui/components/button";
import { CircleCheckIcon, PlusIcon, Trash2Icon } from "lucide-react";

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
	const nothingChecked = checkedCount === 0;
	const allChecked = checkedCount === visibleCount && visibleCount > 0;
	// 「一键通过」只作用于**勾选的**行。没勾任何一行时禁用而不是默默地对全部
	// 生效——那是这一页破坏力最大的误操作。
	const bulkPassBlocked = nothingChecked || !canConclude;

	return (
		<div className="flex flex-wrap items-center gap-1 px-2">
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
			{canEditCases ? (
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
			) : null}
			{checkedCount > 0 ? (
				<span className="ml-auto text-muted-foreground text-xs">
					已选 {checkedCount} 条
				</span>
			) : null}
		</div>
	);
}
