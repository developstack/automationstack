/**
 * 表格行里的启用开关。**一拨就写**，没有保存按钮。
 *
 * 与编辑框里那个勾选项（farm-node-toggle-field.tsx）刻意不是同一个东西：那一份
 * 的语义是「提交时带上这个值」，这一份是「现在就改」。同一个 Checkbox 元件承担
 * 两种语义本来有认错的风险，但这一页的取舍很清楚——停用一台机器是运维时最频繁
 * 的一下（有人要拿回自己的电脑用），为它开一次编辑框、改一个勾、再按保存，是三
 * 次点击换一个布尔值。风险由两处补上：拨动后立刻有一条复述结果的 toast
 * （见 useToggleFarmNodeEnabled），以及请求在飞时它是禁用的，不会被连点两下。
 *
 * 本仓的 packages/ui 里没有 switch，所以只能是 checkbox；真要区分语义，
 * 该补的是那个元件，不是在这里造一个假开关。
 */
import { Checkbox } from "@automationstack/ui/components/checkbox";
import { useCallback } from "react";

import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import { useToggleFarmNodeEnabled } from "@/components/farm-nodes/use-farm-node-mutations";

export function FarmNodeEnabledToggle({ row }: { row: FarmNodeRow }) {
	const toggle = useToggleFarmNodeEnabled();
	const { isPending, mutate } = toggle;

	const handleChange = useCallback(
		(checked: boolean) => mutate({ enabled: checked, id: row.id }),
		[mutate, row.id]
	);

	return (
		/*
		 * aria-label 带上节点名：读屏的表单控件列表里，一排「启用」互相分辨不出来，
		 * 而拨错一台的后果是把别人正在用的机器停掉。
		 * 请求在飞时禁用：连点两下会发出两条方向相反的更新，最后落哪一档取决于
		 * 谁先回来——而屏幕上那个勾读的是服务端数据，会当着人的面弹回去。
		 */
		<Checkbox
			aria-label={`启用「${row.name}」`}
			checked={row.enabled}
			disabled={isPending}
			onCheckedChange={handleChange}
		/>
	);
}
