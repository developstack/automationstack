/**
 * 分步判定汇总条右半边那三颗动作按钮：一键全部通过 / 放弃改动 / 保存判定。
 *
 * 从 `run-steps-summary.tsx` 拆出来（那个文件的私有辅助组件超过了一个文件 2 个的
 * 上限）。props 仍然从汇总条那份 `RunStepsSummaryProps` 里 `Pick`，两边不会各写
 * 一份对不上的类型。
 */
import { Button } from "@automationstack/ui/components/button";
import { CircleCheckBigIcon, RotateCcwIcon, SaveIcon } from "lucide-react";

import type { RunStepsSummaryProps } from "@/components/test-runs/run-steps-summary";

/**
 * 动作按钮统一 `size="sm"`（28px）。
 *
 * 这是一条**段落**的操作条——它管的是「步骤与判定」这一段，不是整个页面，也不是
 * 卡片内部。按台阶规则（见 `packages/ui/src/components/button.tsx` 文件头）：
 * 卡片里重复出现的判定按钮 xs(24)、这里 sm(28)、页面顶部工具栏 default(32)。
 * 三档拉开，一眼能看出哪一组按钮管的是多大范围。
 */
export function StepsSummaryActions({
	dirty,
	editing,
	onPassAll,
	onReset,
	onSave,
	saving,
}: Pick<
	RunStepsSummaryProps,
	"dirty" | "editing" | "onPassAll" | "onReset" | "onSave" | "saving"
>) {
	if (!editing) {
		return null;
	}
	// 「能不能存」算一次给三处用（aria、onClick、文案）：三处各写一遍同一个
	// 布尔表达式，将来加条件时漏掉任何一处，都会变成「看着能点、点了没反应」。
	const saveBlocked = !dirty || saving;
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button onClick={onPassAll} size="sm" type="button" variant="outline">
				<CircleCheckBigIcon aria-hidden="true" data-icon="inline-start" />
				一键全部通过
			</Button>
			{dirty ? (
				<Button onClick={onReset} size="sm" type="button" variant="ghost">
					<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
					放弃改动
				</Button>
			) : null}
			{/*
			 * 没有改动时禁用而不是隐藏：按钮消失会让人以为刚才点的东西没被记下，
			 * 转头去找「保存去哪了」。禁用态摆在原位，配上左边那行「有未保存的
			 * 判定」，两句话合起来才说得清此刻是什么状态。
			 */}
			<Button
				aria-disabled={saveBlocked || undefined}
				onClick={saveBlocked ? undefined : onSave}
				size="sm"
				type="button"
			>
				<SaveIcon aria-hidden="true" data-icon="inline-start" />
				{saving ? "保存中…" : "保存判定"}
			</Button>
		</div>
	);
}
