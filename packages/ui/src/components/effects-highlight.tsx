"use client";

/**
 * animate-ui 的 highlight 效果层，vendored 自上游
 * `registry/primitives/effects/highlight`。一组同级项里只画一个「高亮块」，它在
 * 项与项之间用 spring 滑过去，而不是每一项各自淡入淡出一个底色。
 *
 * 两种模式：
 * - `mode="children"`（默认）：每项各带一个 motion.div，靠共享的 layoutId 让
 *   motion 在两项之间做 shared-layout 过渡。菜单用这个——菜单项数量会变，
 *   共享布局比测坐标稳。
 * - `mode="parent"`：容器里只有一个绝对定位的块，把它的 top/left/width/height
 *   动画到当前项的实测 boundingRect。tabs 用这个——见 tabs.tsx 里的理由。
 *
 * 动效可打断性（本仓 tooltip.tsx 顶部那条既有决定要求交代）：这里全部是 motion
 * 的 spring / layout 过渡，不是关键帧。spring 带着当前位置与当前速度重定目标，
 * 滑到一半改选中项会从半路接着走，不会跳回起点重播，因此满足那条约束。
 *
 * ── 与上游的差别（逐条都有理由，别顺手改回去）──────────────────────────
 *
 * 1. import 路径按本仓别名改写（`@/lib/utils` → `@automationstack/ui/lib/utils`）。
 *
 * 2. **不再把 Base UI 自己的状态属性克隆到子元素上。** 上游会往子元素塞
 *    `data-active`、`aria-selected`、`data-disabled`。这三个在本仓都是灾难：
 *    - 本仓（以及 Tailwind）的 `data-*` 变体是「按属性存在」匹配的，
 *      `data-disabled="false"` 一样命中 `data-disabled:`。于是上游那句
 *      `data-disabled={false}` 会把每一个菜单项都画成 50% 透明且不可点。
 *    - `data-active` 是 Base UI Tabs.Tab 自己的状态属性（TabsTabState.active，
 *      已对着 1.7.0 的 tabs/tab/TabsTab.d.ts 核实），塞一个 "false" 进去
 *      会同时打赢并毁掉 `data-active:` 那一整组样式。
 *    - `aria-selected` 由 Base UI 的 Tab 负责；再写一遍就是 tabs.tsx 顶部注释
 *      早就警告过的「重复声明打架、读屏念两遍」，而包装用的 <div> 上没有 role，
 *      挂 aria-selected 本身就是无效 ARIA。
 *    只保留 `data-value` 与 `data-highlight`：前者是 menu-primitives.tsx 里
 *    useDataState 读回当前高亮项的凭据，后者是 parent 模式滚动时重新找元素的
 *    选择器，两个都不参与样式。
 *
 * 3. 删掉 children 模式下的 `asChild` 分支：上游那段把 `children` 渲染进
 *    `cloneElement(element, ...)` 的第三参里，而 `children` 就是 `element` 本身，
 *    等于把元素套进自己的克隆里渲染两遍。parent 模式的 asChild 是好的（纯克隆、
 *    不加 DOM），保留并改成合并 ref 而不是覆盖调用方的 ref。
 *
 * 4. parent 模式补了 ResizeObserver 与 window resize 监听：上游只在选中值变化时
 *    量一次 bounds，视口一变（本仓的 tab 条外面就套着 overflow-x-auto）高亮块
 *    就停在旧坐标上。
 *
 * 5. 去掉全部 `any`（本仓 noExplicitAny 是 error）、数组下标当 key、嵌套三元。
 *
 * 6. parent 模式新增 `asChild`：把调用方给的元素就地当定位容器，而不是硬套一层
 *    div。理由见 ParentContainer 上面的注释——tabs 的布局类挂在 tab 条本身。
 */

import { cn } from "@automationstack/ui/lib/utils";
import { AnimatePresence, motion, type Transition } from "motion/react";
import type {
	ComponentProps,
	CSSProperties,
	ElementType,
	ReactElement,
	ReactNode,
	Ref,
} from "react";
import {
	Children,
	cloneElement,
	createContext,
	isValidElement,
	useCallback,
	useContext,
	useEffect,
	useId,
	useImperativeHandle,
	useRef,
	useState,
} from "react";

type HighlightMode = "children" | "parent";

interface Bounds {
	height: number;
	left: number;
	top: number;
	width: number;
}

const DEFAULT_BOUNDS_OFFSET: Bounds = {
	height: 0,
	left: 0,
	top: 0,
	width: 0,
};

const DEFAULT_TRANSITION: Transition = {
	damping: 35,
	stiffness: 350,
	type: "spring",
};

interface HighlightContextType {
	activeClassName?: string;
	activeValue: string | null;
	className?: string;
	clearBounds: () => void;
	click: boolean;
	disabled?: boolean;
	enabled?: boolean;
	exitDelay?: number;
	forceUpdateBounds?: boolean;
	hover: boolean;
	id: string;
	mode: HighlightMode;
	setActiveClassName: (className: string) => void;
	setActiveValue: (value: string | null) => void;
	setBounds: (bounds: DOMRect) => void;
	style?: CSSProperties;
	transition?: Transition;
}

const HighlightContext = createContext<HighlightContextType | undefined>(
	undefined
);

function useHighlight(): HighlightContextType {
	const context = useContext(HighlightContext);
	if (!context) {
		throw new Error("useHighlight 必须在 Highlight 内使用");
	}
	return context;
}

interface BaseHighlightProps {
	asChild?: boolean;
	className?: string;
	click?: boolean;
	defaultValue?: string | null;
	disabled?: boolean;
	enabled?: boolean;
	exitDelay?: number;
	hover?: boolean;
	mode?: HighlightMode;
	onValueChange?: (value: string | null) => void;
	ref?: Ref<HTMLDivElement>;
	style?: CSSProperties;
	transition?: Transition;
	value?: string | null;
}

interface ParentModeHighlightProps {
	boundsOffset?: Partial<Bounds>;
	containerClassName?: string;
	forceUpdateBounds?: boolean;
}

type HighlightProps = BaseHighlightProps &
	ParentModeHighlightProps & {
		children: ReactNode;
		/**
		 * true 表示每一项由调用方自己包 HighlightItem；false 时这里替调用方把
		 * 每个直接子节点各包一层。
		 */
		controlledItems?: boolean;
		itemsClassName?: string;
	};

/**
 * parent 模式下那一块共享的高亮：位置与尺寸都是实测值，所以它得等第一次
 * 测量完成（boundsState 非空）才出现。
 */
function ParentHighlight(props: {
	bounds: Bounds | null;
	className?: string;
	exitDelay: number;
	style?: CSSProperties;
	transition: Transition;
}) {
	const { bounds, className, exitDelay, style, transition } = props;

	return (
		<AnimatePresence initial={false} mode="wait">
			{bounds ? (
				<motion.div
					animate={{ ...bounds, opacity: 1 }}
					className={className}
					data-slot="motion-highlight"
					exit={{
						opacity: 0,
						transition: {
							...transition,
							delay: (transition?.delay ?? 0) + exitDelay / 1000,
						},
					}}
					initial={{ ...bounds, opacity: 0 }}
					style={{ position: "absolute", zIndex: 0, ...style }}
					transition={transition}
				/>
			) : null}
		</AnimatePresence>
	);
}

/**
 * parent 模式下的定位容器。
 *
 * `asChild` 时不再多包一层 div，而是把调用方给的那个元素就地当容器，高亮块作为它
 * 的第一个子节点插进去。tabs 必须走这条路：tab 条上挂着调用方给的
 * `mx-4 mt-3 shrink-0`、`flex-1` 这类布局类，也是父级 flex 的直接项；中间插一层
 * div，这些类就全落到了错误的元素上（shrink-0 尤其致命——它防的正是被外面那层
 * flex 压扁）。
 */
function ParentContainer(props: {
	asChild: boolean;
	children: ReactNode;
	containerClassName?: string;
	highlight: ReactNode;
	innerRef: Ref<HTMLDivElement>;
}) {
	const { asChild, children, containerClassName, highlight, innerRef } = props;

	if (asChild && isValidElement(children)) {
		const element = children as ReactElement<Record<string, unknown>>;
		const childClassName = element.props.className;
		// Base UI 的 className 允许是「按 state 算」的函数；那种情况下不去合并，
		// 免得把一个函数塞进 cn() 变成字符串垃圾。
		const mergedClassName =
			typeof childClassName === "function"
				? childClassName
				: cn(
						childClassName as string | undefined,
						"relative",
						containerClassName
					);

		return cloneElement(
			element,
			{
				className: mergedClassName,
				ref: mergeRefs(element.props.ref as Ref<HTMLElement>, innerRef),
			},
			<>
				{highlight}
				{element.props.children as ReactNode}
			</>
		);
	}

	return (
		<div
			className={containerClassName}
			data-slot="motion-highlight-container"
			ref={innerRef}
			style={{ position: "relative", zIndex: 1 }}
		>
			{highlight}
			{children}
		</div>
	);
}

function Highlight({ ref, ...props }: HighlightProps) {
	const {
		asChild = false,
		boundsOffset = DEFAULT_BOUNDS_OFFSET,
		children,
		className,
		click = true,
		containerClassName,
		controlledItems,
		defaultValue,
		disabled = false,
		enabled = true,
		exitDelay = 200,
		forceUpdateBounds,
		hover = false,
		itemsClassName,
		mode = "children",
		onValueChange,
		style,
		transition = DEFAULT_TRANSITION,
		value,
	} = props;

	const localRef = useRef<HTMLDivElement>(null);
	useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

	const [activeValue, setActiveValue] = useState<string | null>(
		value ?? defaultValue ?? null
	);
	const [boundsState, setBoundsState] = useState<Bounds | null>(null);
	const [activeClassName, setActiveClassName] = useState<string>("");

	const offsetTop = boundsOffset.top ?? 0;
	const offsetLeft = boundsOffset.left ?? 0;
	const offsetWidth = boundsOffset.width ?? 0;
	const offsetHeight = boundsOffset.height ?? 0;

	const safeSetActiveValue = useCallback(
		(next: string | null) => {
			setActiveValue((prev) => {
				if (prev === next) {
					return prev;
				}
				onValueChange?.(next);
				return next;
			});
		},
		[onValueChange]
	);

	// 换算成相对容器的坐标。值没变就返回原对象，避免每次滚动都触发重渲染。
	const setBounds = useCallback(
		(rect: DOMRect) => {
			// 具体类型而不是泛型 ref：同 use-data-state.ts 里那条注释，否则
			// noUnnecessaryConditions 会把这个判空当成恒真。
			const container: HTMLElement | null = localRef.current;
			if (!container) {
				return;
			}
			const containerRect = container.getBoundingClientRect();
			const next: Bounds = {
				height: rect.height + offsetHeight,
				left: rect.left - containerRect.left + offsetLeft,
				top: rect.top - containerRect.top + offsetTop,
				width: rect.width + offsetWidth,
			};

			setBoundsState((prev) => {
				if (
					prev &&
					prev.top === next.top &&
					prev.left === next.left &&
					prev.width === next.width &&
					prev.height === next.height
				) {
					return prev;
				}
				return next;
			});
		},
		[offsetHeight, offsetLeft, offsetTop, offsetWidth]
	);

	const clearBounds = useCallback(() => {
		setBoundsState((prev) => (prev === null ? prev : null));
	}, []);

	useEffect(() => {
		if (value !== undefined) {
			setActiveValue(value);
		} else if (defaultValue !== undefined) {
			setActiveValue(defaultValue);
		}
	}, [value, defaultValue]);

	const id = useId();

	// 容器自己滚动时（长菜单）重新贴上去：高亮块是绝对定位在容器坐标系里的。
	useEffect(() => {
		const container = localRef.current;
		if (mode !== "parent" || !container) {
			return;
		}

		const onScroll = () => {
			if (!activeValue) {
				return;
			}
			const active = container.querySelector<HTMLElement>(
				`[data-value="${CSS.escape(activeValue)}"][data-highlight="true"]`
			);
			if (active) {
				setBounds(active.getBoundingClientRect());
			}
		};

		container.addEventListener("scroll", onScroll, { passive: true });
		return () => container.removeEventListener("scroll", onScroll);
	}, [mode, activeValue, setBounds]);

	const contextValue: HighlightContextType = {
		activeClassName,
		activeValue,
		className,
		clearBounds,
		click,
		disabled,
		enabled,
		exitDelay,
		forceUpdateBounds,
		hover,
		id,
		mode,
		setActiveClassName,
		setActiveValue: safeSetActiveValue,
		setBounds,
		style,
		transition,
	};

	let content: ReactNode = children;
	if (!controlledItems) {
		content = Children.map(children, (child) => {
			if (!isValidElement(child)) {
				return child;
			}
			return (
				<HighlightItem className={itemsClassName}>
					{child as ReactElement<Record<string, unknown>>}
				</HighlightItem>
			);
		});
	}

	if (!enabled) {
		return (
			<HighlightContext.Provider value={contextValue}>
				{children}
			</HighlightContext.Provider>
		);
	}

	return (
		<HighlightContext.Provider value={contextValue}>
			{mode === "parent" ? (
				<ParentContainer
					asChild={asChild}
					containerClassName={containerClassName}
					highlight={
						<ParentHighlight
							bounds={boundsState}
							className={cn(className, activeClassName)}
							exitDelay={exitDelay}
							style={style}
							transition={transition}
						/>
					}
					innerRef={localRef}
				>
					{content}
				</ParentContainer>
			) : (
				content
			)}
		</HighlightContext.Provider>
	);
}

/** 调用方已经写死的属性不覆盖：他们写的那份才是本意。 */
function nonOverridingAttributes(
	element: ReactElement<Record<string, unknown>>,
	attributes: Record<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(attributes)) {
		if (element.props[key] === undefined) {
			result[key] = attributes[key];
		}
	}
	return result;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
	return (node: T | null) => {
		for (const ref of refs) {
			if (!ref) {
				continue;
			}
			if (typeof ref === "function") {
				ref(node);
			} else {
				(ref as { current: T | null }).current = node;
			}
		}
	};
}

type HighlightItemProps<T extends ElementType = "div"> = Omit<
	ComponentProps<T>,
	"children" | "ref"
> & {
	activeClassName?: string;
	as?: T;
	asChild?: boolean;
	/**
	 * 只写 `ReactElement`（P 默认是 unknown）而不是 `ReactElement<Record<string,
	 * unknown>>`：Base UI 的 props 都是 interface，interface 缺索引签名，TS 不认它
	 * 可赋给 Record<string, unknown>，写成后者的话每个调用点都要加一次断言。
	 */
	children: ReactElement;
	className?: string;
	disabled?: boolean;
	exitDelay?: number;
	forceUpdateBounds?: boolean;
	id?: string;
	ref?: Ref<HTMLDivElement>;
	style?: CSSProperties;
	transition?: Transition;
	value?: string;
};

/** children 模式下那块跟着 layoutId 在项与项之间滑动的底色。 */
function ChildHighlight(props: {
	className?: string;
	exitDelay: number;
	layoutId: string;
	style?: CSSProperties;
	transition?: Transition;
	visible: boolean;
}) {
	const { className, exitDelay, layoutId, style, transition, visible } = props;

	return (
		<AnimatePresence initial={false} mode="wait">
			{visible ? (
				<motion.div
					animate={{ opacity: 1 }}
					className={className}
					data-slot="motion-highlight"
					exit={{
						opacity: 0,
						transition: {
							...transition,
							delay: (transition?.delay ?? 0) + exitDelay / 1000,
						},
					}}
					initial={{ opacity: 0 }}
					layoutId={layoutId}
					style={{ position: "absolute", zIndex: 0, ...style }}
					transition={transition}
				/>
			) : null}
		</AnimatePresence>
	);
}

/**
 * parent 模式下把当前项的坐标喂给容器，并盯住之后的尺寸/视口变化。
 * 上游只在选中值变化时量一次，视口一变高亮块就停在旧坐标上。
 */
function useParentBounds(
	element: { current: HTMLElement | null },
	options: {
		activeClassName?: string;
		activeValue: string | null;
		clearBounds: () => void;
		forceUpdateBounds: boolean;
		isActive: boolean;
		isParentMode: boolean;
		setActiveClassName: (className: string) => void;
		setBounds: (rect: DOMRect) => void;
	}
) {
	const {
		activeClassName,
		activeValue,
		clearBounds,
		forceUpdateBounds,
		isActive,
		isParentMode,
		setActiveClassName,
		setBounds,
	} = options;

	useEffect(() => {
		if (!isParentMode) {
			return;
		}
		if (!isActive) {
			if (!activeValue) {
				clearBounds();
			}
			return;
		}

		const measure = () => {
			if (element.current) {
				setBounds(element.current.getBoundingClientRect());
			}
		};

		measure();
		setActiveClassName(activeClassName ?? "");

		// forceUpdateBounds 是上游给「坐标每帧都在动」（如自身也在做布局动画的
		// 容器）留的后门，代价是一个常驻 rAF 循环，默认不开。
		let rafId = 0;
		if (forceUpdateBounds) {
			const tick = () => {
				measure();
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);
		}

		// 常规情况只需要在「尺寸变了」时补量：视口缩放、字体换掉、兄弟项增减。
		const observer = new ResizeObserver(measure);
		if (element.current) {
			observer.observe(element.current);
			if (element.current.parentElement) {
				observer.observe(element.current.parentElement);
			}
		}
		window.addEventListener("resize", measure);

		return () => {
			if (rafId) {
				cancelAnimationFrame(rafId);
			}
			observer.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [
		element,
		isParentMode,
		isActive,
		activeValue,
		clearBounds,
		setBounds,
		setActiveClassName,
		activeClassName,
		forceUpdateBounds,
	]);
}

function HighlightItem<T extends ElementType = "div">({
	ref,
	as,
	children,
	id,
	value,
	className,
	style,
	transition,
	disabled,
	activeClassName,
	exitDelay,
	asChild = false,
	forceUpdateBounds,
	...props
}: HighlightItemProps<T>) {
	const itemId = useId();
	const context = useHighlight();
	const localRef = useRef<HTMLDivElement>(null);
	useImperativeHandle(ref, () => localRef.current as HTMLDivElement);

	const element = children as ReactElement<Record<string, unknown>>;
	const childValue =
		id ??
		value ??
		(element.props["data-value"] as string | undefined) ??
		(element.props.id as string | undefined) ??
		itemId;
	const isActive = context.activeValue === childValue;
	const isDisabled = disabled ?? context.disabled;
	const itemTransition = transition ?? context.transition;
	const isParentMode = context.mode === "parent";

	const refCallback = useCallback((node: HTMLElement | null) => {
		localRef.current = node as HTMLDivElement;
	}, []);

	useParentBounds(localRef, {
		activeClassName,
		activeValue: context.activeValue,
		clearBounds: context.clearBounds,
		forceUpdateBounds:
			forceUpdateBounds === true ||
			(context.forceUpdateBounds === true && forceUpdateBounds !== false),
		isActive,
		isParentMode,
		setActiveClassName: context.setActiveClassName,
		setBounds: context.setBounds,
	});

	/*
	 * 只发这两个，其余 Base UI 自己会发。理由见文件顶部第 2 条——多发一个
	 * data-active="false" 就会把整组 `data-active:` 样式点亮。
	 */
	const dataAttributes = {
		"data-highlight": true,
		"data-value": childValue,
	};

	const setActive = context.setActiveValue;
	let handlers: Record<string, unknown> = {};
	if (context.hover) {
		handlers = {
			onMouseEnter: (event: MouseEvent) => {
				setActive(childValue);
				(element.props.onMouseEnter as ((e: MouseEvent) => void) | undefined)?.(
					event
				);
			},
			onMouseLeave: (event: MouseEvent) => {
				setActive(null);
				(element.props.onMouseLeave as ((e: MouseEvent) => void) | undefined)?.(
					event
				);
			},
		};
	} else if (context.click) {
		handlers = {
			onClick: (event: MouseEvent) => {
				setActive(childValue);
				(element.props.onClick as ((e: MouseEvent) => void) | undefined)?.(
					event
				);
			},
		};
	}

	if (!context.enabled) {
		return children;
	}

	// parent 模式下不需要每项各带一块高亮，于是 asChild 可以做成纯克隆：
	// 一个 DOM 节点都不多加，Base UI 的 Tab 结构原样保留。
	if (asChild && isParentMode) {
		return cloneElement(element, {
			...nonOverridingAttributes(element, dataAttributes),
			...handlers,
			ref: mergeRefs(element.props.ref as Ref<HTMLElement>, refCallback),
		});
	}

	const Component = (as ?? "div") as ElementType;

	return (
		<Component
			className={cn(!isParentMode && "relative", className)}
			data-slot="motion-highlight-item-container"
			ref={localRef}
			{...dataAttributes}
			{...props}
			{...handlers}
		>
			{!isParentMode && (
				<ChildHighlight
					className={cn(context.className, activeClassName)}
					exitDelay={exitDelay ?? context.exitDelay ?? 0}
					layoutId={`transition-background-${context.id}`}
					style={{ ...context.style, ...style }}
					transition={itemTransition}
					visible={isActive && !isDisabled}
				/>
			)}
			{cloneElement(element, {
				...nonOverridingAttributes(element, dataAttributes),
				style: {
					position: "relative",
					zIndex: 1,
					...(element.props.style as CSSProperties),
				},
			})}
		</Component>
	);
}

export {
	Highlight,
	HighlightItem,
	type HighlightItemProps,
	type HighlightProps,
	useHighlight,
};
