"use client";

import {
	AutoHeight,
	type AutoHeightProps,
} from "@automationstack/ui/components/effects-auto-height";
import {
	Highlight,
	HighlightItem,
} from "@automationstack/ui/components/effects-highlight";
import { useDataState } from "@automationstack/ui/hooks/use-data-state";
import { getStrictContext } from "@automationstack/ui/lib/get-strict-context";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type { Transition } from "motion/react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { useEffect, useMemo, useState } from "react";

/**
 * animate-ui 的 base tabs primitive，vendored 自上游
 * `registry/primitives/base/tabs`。底座仍是 Base UI Tabs（ARIA APG 的 tabs 模式、
 * roving tabindex、方向键导航全归它），这一层只加一块会在标签之间滑过去的高亮。
 *
 * ── 与上游的差别 ────────────────────────────────────────────────────────
 *
 * 1. 包名与别名：上游 import 旧包名 `@base-ui-components/react/tabs`，本仓是
 *    `@base-ui/react` 1.7.0；`@/lib/*`、`@/hooks/*` 一并改写成本包的 exports 路径。
 *
 * 2. **选中态读 `data-active` 而不是上游的 `data-selected`。** 1.7.0 的
 *    TabsTabState 里字段叫 `active`（已对着 tabs/tab/TabsTab.d.ts 核实），发出来的
 *    属性就是 `data-active`；上游那份是旧版本的写法，照抄的话 useDataState 永远
 *    读不到值，高亮块一辈子不出现。
 *
 * 3. **用 `mode="parent"` + 每项 asChild，而不是上游默认的 children 模式。**
 *    children 模式会给每个 Tab 外面套一层 div，本仓 tabs.tsx 的 trigger 依赖
 *    `flex-1`、`h-[calc(100%-1px)]`（百分比高度要求父级高度确定）以及
 *    `group-data-vertical/tabs:*` 这一串——中间插一层 auto 高度的 div 就全废了。
 *    parent 模式下 HighlightItem 的 asChild 分支是纯克隆：一个 DOM 节点都不多加。
 *    容器那一侧同理走 `asChild`——tab 条本身就是定位容器（见 effects-highlight.tsx
 *    的 ParentContainer），调用方挂在 TabsList 上的 mx-4 / shrink-0 这些布局类才
 *    还落在同一个元素上。整棵树相对迁移前一个节点都没多。
 *
 * 4. 选中值不从 Tabs.Root 的受控 value 拿，而是每个 Tab 自己上报
 *    （useDataState 读自己节点上的 `data-active`）。理由：Base UI 的 Root 值既可能
 *    受控也可能非受控，且 1.7.0 没有公开的 root context 可读；让节点自报是唯一
 *    不需要调用方改 API 的路子——而本次迁移的前提就是对外 API 一个字都不能动。
 *
 * 5. 动效可打断性（本仓 tooltip.tsx 顶部那条既有决定要求交代）：高亮块用的是
 *    motion 的 spring，不是关键帧。滑到一半再点别的标签会带着当前位置与速度改道，
 *    不会跳回起点重播，满足那条约束。tabs 本身没有浮层，不涉及 popup-transition。
 */

interface TabsHighlightContextType {
	activeValue: string | null;
	setActiveValue: (value: string | null) => void;
}

const [TabsHighlightProvider, useTabsHighlight] =
	getStrictContext<TabsHighlightContextType>("TabsHighlightContext");

/**
 * 「当前选中的是哪个标签」这份状态挂在 Root 上，而不是挂在 TabsHighlight 上：
 * TabsPanels 也要读它（面板高度动画的重量时机），而它在 tab 条外面。
 */
function Tabs(props: TabsPrimitive.Root.Props) {
	const [activeValue, setActiveValue] = useState<string | null>(null);

	const context = useMemo(
		() => ({ activeValue, setActiveValue }),
		[activeValue]
	);

	return (
		<TabsHighlightProvider value={context}>
			<TabsPrimitive.Root {...props} />
		</TabsHighlightProvider>
	);
}

interface TabsHighlightProps {
	asChild?: boolean;
	children: ReactNode;
	className?: string;
	containerClassName?: string;
	enabled?: boolean;
	style?: CSSProperties;
	transition?: Transition;
}

/**
 * 包住整条 tab 条。`enabled={false}` 时 Highlight 会原样吐出 children——既不加容器
 * div，HighlightItem 也退化成透传，DOM 与迁移前逐字节相同。line 变体走的就是这条
 * 路：它的选中态是一条下划线（`after:`），不需要底色块。
 */
function TabsHighlight({
	asChild,
	children,
	className,
	containerClassName,
	enabled = true,
	style,
	transition,
}: TabsHighlightProps) {
	const { activeValue } = useTabsHighlight();

	return (
		<Highlight
			asChild={asChild}
			className={className}
			click={false}
			containerClassName={containerClassName}
			controlledItems
			enabled={enabled}
			hover={false}
			mode="parent"
			style={style}
			transition={transition}
			value={activeValue}
		>
			{children}
		</Highlight>
	);
}

type TabsListProps = TabsPrimitive.List.Props & {
	containerClassName?: string;
	highlightClassName?: string;
	highlightEnabled?: boolean;
	transition?: Transition;
};

function TabsList({
	children,
	containerClassName,
	highlightClassName,
	highlightEnabled,
	transition,
	...props
}: TabsListProps) {
	return (
		<TabsHighlight
			asChild
			className={highlightClassName}
			containerClassName={containerClassName}
			enabled={highlightEnabled}
			transition={transition}
		>
			<TabsPrimitive.List {...props}>{children}</TabsPrimitive.List>
		</TabsHighlight>
	);
}

/**
 * 把 Base UI 落在 Tab 节点上的 `data-active` 抬进 React 状态。
 *
 * 只在变成 true 时上报：切换标签时旧的那个会先发一次 false，理它的话高亮块会先
 * 消失再出现，滑动过渡就断了。
 */
function useActiveTab<T extends HTMLElement>(
	itemValue: string,
	forwardedRef?: Ref<T | null>
) {
	const { setActiveValue } = useTabsHighlight();
	const [state, ref] = useDataState<T>("active", forwardedRef);

	useEffect(() => {
		if (state === true) {
			setActiveValue(itemValue);
		}
	}, [state, itemValue, setActiveValue]);

	return ref;
}

function TabsTab({ ref, ...props }: TabsPrimitive.Tab.Props) {
	// HighlightItem 认字符串；Base UI 的 TabsTab.Value 是 any（可以是对象），
	// 所以这里统一转成字符串，两边比对的才是同一个东西。
	const itemValue = String(props.value);
	const activeRef = useActiveTab<HTMLButtonElement>(itemValue, ref);

	return (
		<HighlightItem asChild value={itemValue}>
			<TabsPrimitive.Tab ref={activeRef} {...props} />
		</HighlightItem>
	);
}

function TabsPanel(props: TabsPrimitive.Panel.Props) {
	return <TabsPrimitive.Panel {...props} />;
}

/**
 * 可选的面板容器：把高度动画到当前面板的实测高度，切换标签时不会「啪」地跳一下。
 * 走的是 effects-auto-height（motion spring，可打断）。
 *
 * 本仓的 tabs.tsx 目前没有用它——对外 API 是冻结的，没有 TabsPanels 这个导出，
 * 加一个就破坏了「一个字都不改」的前提。留在这一层是为了让 auto-height 这条
 * vendored 路径完整可用，将来要开这个效果不必再补文件。
 */
function TabsPanels(props: AutoHeightProps) {
	const { activeValue } = useTabsHighlight();

	// 整包透传而不是解构：AutoHeightProps 是 asChild 真/假两支的联合，一旦解构
	// 出 children 就丢了判别，TS 会把两支的 children 交起来算。
	return <AutoHeight {...props} deps={[activeValue, ...(props.deps ?? [])]} />;
}

export {
	Tabs,
	TabsHighlight,
	type TabsHighlightProps,
	TabsList,
	type TabsListProps,
	TabsPanel,
	TabsPanels,
	TabsTab,
	useTabsHighlight,
};
