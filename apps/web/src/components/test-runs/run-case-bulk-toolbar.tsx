/**
 * 执行台左栏的批量操作条。
 *
 * 早先它就已经从 `RunCaseList` 里抽成了一个函数，理由是把那个组件的认知复杂度
 * 压回阈值内、顺带让「哪些按钮依赖勾选数」集中在一处。现在连文件也分开——
 * `run-case-list.tsx` 超了仓库 300 行的上限，而这一块本来就是独立的一段。
 *
 * 禁用一律用 `aria-disabled` + 不挂 onClick，而不是 `disabled`：原生 disabled
 * 的按钮拿不到焦点，读屏用户 Tab 过去时它直接消失，没人知道这里本来有个操作。
 *
 * 按钮按「谁有权按」分成两组各占一个组件：判定组（全选 / 一键通过 / 指派给我）
 * 与增删组（移出 / 追加用例）。这么切有两个理由：一是把 `BulkToolbar` 的行数与
 * 圈复杂度压回 eslint 的 50 行 / 10 的上限之内——那 12 点复杂度几乎全来自
 * 「每颗按钮各自判一次禁用」，按组搬走就跟着搬走了；二是增删组本来就整体挂在
 * `canEditCases` 上，把那层条件收进组件里，工具条这一层不必再写一个包住五颗
 * 按钮的三元。
 *
 * 「哪些按钮依赖勾选数」仍然集中在 `BulkToolbar`：三个布尔量在这里算完再往下
 * 发，两个子组件只管画，不各自重算一遍 `checkedCount === 0`。
 */
import { Button } from "@automationstack/ui/components/button";
import { CircleCheckIcon, PlusIcon, Trash2Icon } from "lucide-react";

/**
 * 判定组：全选、一键通过、指派给我。
 *
 * 与下面的增删组一样定义在模块顶层——写进 `BulkToolbar` 内部的话，父组件每次
 * 重渲染都会造出一个新的组件类型，React 会把这一段整个卸载重建。
 */
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

/**
 * 增删组：移出、追加用例。没有增删权限时整组不出现——不是禁用，是不画，
 * 与原先工具条里那个包住这两颗按钮的 `canEditCases` 三元完全等价。
 */
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
	/*
	 * 两种权限都没有 = 这条工具条上没有一颗按得动的按钮，整条不画。
	 *
	 * 这个判断原先写在 `RunCaseList` 里（`selectable ? <BulkToolbar /> : null`），
	 * 搬进来是因为工具条本来就拿得到这两个权限位，由它自己回答「我有没有用」比
	 * 让调用方替它算一遍更实在；`RunCaseList` 那边留下的同名布尔量是给清单行用的
	 * （行要据此决定画不画勾选框），两者恰好同一个式子，不是重复判断。
	 */
	if (!(canConclude || canEditCases)) {
		return null;
	}

	const nothingChecked = checkedCount === 0;
	const allChecked = checkedCount === visibleCount && visibleCount > 0;
	// 「一键通过」只作用于**勾选的**行。没勾任何一行时禁用而不是默默地对全部
	// 生效——那是这一页破坏力最大的误操作。
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
