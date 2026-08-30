"use client";

import {
	Highlight,
	HighlightItem,
	type HighlightItemProps,
	type HighlightProps,
} from "@automationstack/ui/components/effects-highlight";
import { useDataState } from "@automationstack/ui/hooks/use-data-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { Ref } from "react";
import { useEffect, useMemo, useState } from "react";

/**
 * animate-ui 的 base menu primitive，vendored 自上游
 * `registry/primitives/base/menu`。底座仍是 Base UI，这一层只加一件事：把「当前
 * 高亮的是哪一项」抬进 React 状态，交给 effects-highlight 画成一块会滑动的底色，
 * 取代原来每项各自 `focus:bg-accent` 的硬切换。
 *
 * ── 为什么 dropdown-menu 与 context-menu 共用这一个文件 ───────────────────
 *
 * Base UI 1.7.0 里 `@base-ui/react/menu` 与 `@base-ui/react/context-menu` 是两个
 * 子路径，但只有 Root 与 Trigger 是各自独立的实现；弹层与项那一整套
 * （Portal / Positioner / Popup / Item / CheckboxItem / RadioItem / Submenu* /
 * Group / GroupLabel / Separator / Arrow / Backdrop）在 context-menu 的
 * index.parts 里就是 `export { MenuXxx as Xxx } from "../menu/…"`——同一个模块的
 * 同一个导出，运行时是同一个对象（实测过：除 Root / Trigger 外全部 `===`）。
 *
 * 所以这里既不复制两份，也不为「传 namespace 进来」写泛型：共享的部分直接引用
 * `MenuPrimitive.*`（它们本来就是 context-menu 会拿到的那几个组件），只有 Root 与
 * Trigger 各留一层薄壳。把 namespace 参数化反而要为两套互不兼容的
 * ChangeEventDetails 加一层没有收益的类型体操，换不来任何复用。
 *
 * ── 与上游的差别 ────────────────────────────────────────────────────────
 *
 * 1. 包名：上游 import 的是旧包名 `@base-ui-components/react/xxx`，本仓是
 *    `@base-ui/react` 1.7.0，每一处 specifier 都改写过；路径别名同理。
 *
 * 2. **Portal / Positioner / Popup 保持素透传，不套 AnimatePresence、不换
 *    motion.div。** 上游把弹层进出场也做成 motion（Portal 外面裹 AnimatePresence
 *    + keepMounted，Popup 用 render={<motion.div>}）。本仓不采用：
 *    - 本仓早有一条既有决定（见 tooltip.tsx 顶部与 globals.css 的
 *      popup-transition）：浮层进出场用 CSS transition。transition 本来就可打断，
 *      退场播到一半再打开会从当前值接上，正是当初从关键帧换过来的原因。换成
 *      motion 在可打断性上没有增益。
 *    - 换过去还会丢东西：popup-transition 消费 Base UI 的 `data-instant`，
 *      键盘连续操作时把时长压到 0 不留拖影，motion 那条路读不到这个信号。
 *    - 两者甚至直接冲突：上游 Portal 的 AnimatePresence 子节点不是 motion 组件，
 *      关闭时会被立刻卸载，CSS 的退场过渡根本来不及播。
 *    因此这一层只引入「高亮块」这一个 motion 效果（spring，可打断），弹层动画仍归
 *    CSS。
 *
 * 3. 上游在 Root 里用 useControlledState 再存一份 open，只为喂给那个
 *    AnimatePresence；既然不套 AnimatePresence，这份状态就是纯多余的重渲染，删掉。
 *
 * 4. **高亮状态挂在 MenuHighlight（每个弹层一份）而不是 Root 上。** 上游挂在 Root，
 *    于是父菜单与子菜单共用一个「当前高亮项」，鼠标移进子菜单会把父菜单里那个
 *    SubmenuTrigger 的高亮抢走、而父弹层里又没有任何一项匹配，高亮块直接消失。
 *    每个弹层各持一份就没有这个问题；而且弹层关闭时整棵子树卸载，状态自动归零，
 *    不需要再在 onOpenChange 里手工清一次。
 *
 * 5. 上游每个 item 都把 `useDataState` 的 onChange 写成内联箭头函数，effect 依赖
 *    每帧都变；这里改成读 useDataState 返回的 state，依赖才真的稳定。
 */

interface MenuHighlightContextType {
	highlightedValue: string | null;
	setHighlightedValue: (value: string | null) => void;
}

const [MenuHighlightProvider, useMenuHighlight] =
	getStrictContext<MenuHighlightContextType>("MenuHighlightContext");

/**
 * Root / Trigger 只是薄壳：这一层没有状态要加（见上面第 3、4 条），保留它们是为了
 * 让上层的 dropdown-menu / context-menu 只从这一个模块取件，不必再各自 import 两个
 * Base UI 子路径。
 */
function Menu(props: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root {...props} />;
}

function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
	return <MenuPrimitive.Trigger {...props} />;
}

function ContextMenuRoot(props: ContextMenuPrimitive.Root.Props) {
	return <ContextMenuPrimitive.Root {...props} />;
}

function ContextMenuTrigger(props: ContextMenuPrimitive.Trigger.Props) {
	return <ContextMenuPrimitive.Trigger {...props} />;
}

function MenuPortal(props: MenuPrimitive.Portal.Props) {
	return <MenuPrimitive.Portal {...props} />;
}

function MenuPositioner(props: MenuPrimitive.Positioner.Props) {
	return <MenuPrimitive.Positioner {...props} />;
}

function MenuPopup(props: MenuPrimitive.Popup.Props) {
	return <MenuPrimitive.Popup {...props} />;
}

function MenuArrow(props: MenuPrimitive.Arrow.Props) {
	return <MenuPrimitive.Arrow {...props} />;
}

function MenuGroup(props: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group {...props} />;
}

function MenuGroupLabel(props: MenuPrimitive.GroupLabel.Props) {
	return <MenuPrimitive.GroupLabel {...props} />;
}

function MenuSeparator(props: MenuPrimitive.Separator.Props) {
	return <MenuPrimitive.Separator {...props} />;
}

function MenuSubmenuRoot(props: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot {...props} />;
}

function MenuCheckboxItemIndicator(
	props: MenuPrimitive.CheckboxItemIndicator.Props
) {
	return <MenuPrimitive.CheckboxItemIndicator {...props} />;
}

function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
	return <MenuPrimitive.RadioGroup {...props} />;
}

function MenuRadioItemIndicator(props: MenuPrimitive.RadioItemIndicator.Props) {
	return <MenuPrimitive.RadioItemIndicator {...props} />;
}

type MenuHighlightProps = Omit<
	HighlightProps,
	"click" | "controlledItems" | "hover" | "value"
>;

/**
 * 包在 Popup 里、包住全部菜单项的那一层。它自己不产 DOM（controlledItems +
 * children 模式），只负责提供「当前高亮项」这份状态并把高亮块画出来。
 *
 * click / hover 都关掉：高亮的唯一真相是 Base UI 落在节点上的 `data-highlighted`，
 * 键盘与鼠标它都已经算好了。这一层再自己监听一遍只会和它打架。
 */
function MenuHighlight({ children, ...props }: MenuHighlightProps) {
	const [highlightedValue, setHighlightedValue] = useState<string | null>(null);

	const context = useMemo(
		() => ({ highlightedValue, setHighlightedValue }),
		[highlightedValue]
	);

	return (
		<MenuHighlightProvider value={context}>
			<Highlight
				click={false}
				controlledItems
				hover={false}
				value={highlightedValue}
				{...props}
			>
				{children}
			</Highlight>
		</MenuHighlightProvider>
	);
}

function MenuHighlightItem(props: HighlightItemProps) {
	return <HighlightItem {...props} />;
}

/**
 * 把 Base UI 落在真实节点上的 `data-highlighted` 抬进 React 状态。
 *
 * 读节点上的 `data-value` 而不是自己再编一个号：那个值是 HighlightItem 分配并写到
 * 同一个节点上的，两边必须是同一个字符串，高亮块才认得出该滑到哪一项。
 */
function useHighlightedItem<T extends HTMLElement>(
	forwardedRef?: Ref<T | null>
) {
	const { setHighlightedValue } = useMenuHighlight();
	const [state, ref] = useDataState<T>("highlighted", forwardedRef);

	useEffect(() => {
		if (state !== true) {
			return;
		}
		const element = ref.current;
		const next = element?.dataset.value || element?.id || null;
		if (next) {
			setHighlightedValue(next);
		}
	}, [state, ref, setHighlightedValue]);

	return ref;
}

function MenuItem({ ref, ...props }: MenuPrimitive.Item.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.Item ref={highlightedRef} {...props} />;
}

function MenuSubmenuTrigger({
	ref,
	...props
}: MenuPrimitive.SubmenuTrigger.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.SubmenuTrigger ref={highlightedRef} {...props} />;
}

function MenuCheckboxItem({ ref, ...props }: MenuPrimitive.CheckboxItem.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.CheckboxItem ref={highlightedRef} {...props} />;
}

function MenuRadioItem({ ref, ...props }: MenuPrimitive.RadioItem.Props) {
	const highlightedRef = useHighlightedItem<HTMLDivElement>(ref);
	return <MenuPrimitive.RadioItem ref={highlightedRef} {...props} />;
}

export {
	ContextMenuRoot,
	ContextMenuTrigger,
	Menu,
	MenuArrow,
	MenuCheckboxItem,
	MenuCheckboxItemIndicator,
	MenuGroup,
	MenuGroupLabel,
	MenuHighlight,
	MenuHighlightItem,
	type MenuHighlightProps,
	MenuItem,
	MenuPopup,
	MenuPortal,
	MenuPositioner,
	MenuRadioGroup,
	MenuRadioItem,
	MenuRadioItemIndicator,
	MenuSeparator,
	MenuSubmenuRoot,
	MenuSubmenuTrigger,
	MenuTrigger,
	useMenuHighlight,
};
