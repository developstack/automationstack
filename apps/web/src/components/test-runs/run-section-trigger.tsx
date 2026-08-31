/**
 * 执行台右栏里「可收起区块」的标题行：一段标题文字 + 随开合旋转的箭头。
 *
 * ## 它解决的是对齐，不是复用
 *
 * 原先「执行结论」与「判定记录」各自手写一遍
 * `<CollapsibleTrigger render={<Button variant="ghost" className="w-full justify-start">…}>`，
 * 两处都把 chevron 当成 `data-icon="inline-start"` 的行首图标。后果是标题文字被顶到
 * 距容器左边缘 30px 处（`size=default` 的 `px-2.5` 遇到行首图标收成 `pl-2` = 8px，
 * 加图标 16px，加 `gap-1.5` 6px），而这一栏其余区块（前置条件、步骤与判定）的
 * `<h3>` 都从 x=0 起排。用户两次提到同一件事：标题跟下方正文「没有视觉对齐」。
 *
 * ## 为什么选「图标外挂」而不是「给正文加缩进」
 *
 * 两种做法都能对齐，但给正文统一缩进 30px 要么写任意值（本仓禁止），要么新造一个
 * 具名 @utility，而且会在一个本来就窄的右栏里再吃掉 30px 宽度——每一条步骤、每一行
 * 判定记录都要为一枚箭头付这笔钱。把按钮的左右内边距压掉、让标题回到 x=0 更便宜，
 * 代价只是 ghost 的悬停底色变成通栏，那反而让「整行可点」这件事更明显。
 *
 * ## 箭头为什么挪到标题右边
 *
 * 不是审美，是 tailwind-merge 的机械后果：`px-0` 只顶得掉 base 里的 `px-2.5`，
 * `has-data-[icon=inline-start]:pl-2` 带着不同的 modifier 前缀、属于另一个类组，
 * 合并时不会被消掉。箭头只要还带着 `data-icon="inline-start"`，那 8px 就还在。
 * 所以这里的箭头**不带 `data-icon`**，跟在标题后面，间距由 size 自带的 `gap-1.5` 给。
 *
 * ## 具名 group 必须统一
 *
 * 箭头的旋转靠 `group-data-open/run-section:rotate-180`，而 Tailwind 不扫描拼接出来的
 * 类名，group 名没法当参数传。所以两个调用点的 `Collapsible` 根都改用同一个
 * `group/run-section`（原来是 `group/run-verdict` 与 `group/run-case-events`）。
 * 两者在这一栏里是兄弟节点、不存在嵌套，同名不会串。
 *
 * `aria-expanded` 由 base-ui 的 Trigger 自己打在按钮上，这里不重复声明——手写一份
 * 就多一份会和真实开合状态失配的可能。
 */
import { Button } from "@automationstack/ui/components/button";
import { CollapsibleTrigger } from "@automationstack/ui/components/collapsible";
import { ChevronDownIcon } from "lucide-react";

import { RUN_SECTION_TITLE } from "@/components/test-runs/run-panel-typography";

/** 可收起区块的标题行。必须放在某个 `Collapsible`（带 `group/run-section`）之内。 */
export function RunSectionTrigger({ label }: { label: string }) {
	return (
		<CollapsibleTrigger
			render={
				<Button
					className="w-full justify-start px-0"
					type="button"
					variant="ghost"
				>
					<span className={RUN_SECTION_TITLE}>{label}</span>
					<ChevronDownIcon
						aria-hidden="true"
						className="transition-transform group-data-open/run-section:rotate-180"
					/>
				</Button>
			}
		/>
	);
}
