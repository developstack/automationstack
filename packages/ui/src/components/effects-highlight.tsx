"use client";

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
		controlledItems?: boolean;
		itemsClassName?: string;
	};

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

	const setBounds = useCallback(
		(rect: DOMRect) => {
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

		let rafId = 0;
		if (forceUpdateBounds) {
			const tick = () => {
				measure();
				rafId = requestAnimationFrame(tick);
			};
			rafId = requestAnimationFrame(tick);
		}

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
