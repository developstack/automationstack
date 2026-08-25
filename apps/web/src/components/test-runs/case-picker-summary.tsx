/**
 * 用例选择器底部那行常驻的「已选 N 条」与清空入口
 * （从 `case-picker.tsx` 拆出来，见 eslint 的 50 行函数上限）。
 *
 * 和右栏一样定义在模块顶层：它读的是选中总数，父组件每勾一下就重渲染一次，
 * 组件类型跟着重建会让这一行的 aria-live 区域每次都被当作新节点插入，
 * 读屏要么重复播报要么干脆漏播。
 */
import { Button } from "@automationstack/ui/components/button";

import { casePageCount } from "@/components/cases/case-list-query";

interface CasePickerSummaryProps {
	/** 列表还没回来时不写「当前范围共 …」——那时候一个数都还不知道。 */
	hasData: boolean;
	onClear: () => void;
	page: number;
	selectedCount: number;
	total: number;
}

export function CasePickerSummary({
	hasData,
	onClear,
	page,
	selectedCount,
	total,
}: CasePickerSummaryProps) {
	return (
		/*
		 * 已选条数是**跨筛选**的合计，而屏幕上只看得见当前这一页里被勾中的几条，
		 * 两个数对不上是必然的。aria-live 让读屏在每次勾选后播报合计，
		 * 否则键盘用户完全无从知道自己到底选了多少。
		 */
		<div className="flex items-center justify-between border-t pt-3">
			<p aria-live="polite" className="text-muted-foreground text-sm">
				已选{" "}
				<span className="font-medium text-foreground tabular-nums">
					{selectedCount}
				</span>{" "}
				条用例
				{hasData
					? `，当前范围共 ${total} 条（第 ${page} / ${casePageCount(total)} 页）`
					: ""}
			</p>
			<Button
				aria-disabled={selectedCount === 0}
				onClick={onClear}
				size="sm"
				type="button"
				variant="ghost"
			>
				清空选择
			</Button>
		</div>
	);
}
