"use client";

/**
 * animate-ui 的 `asChild` 实现，随 effects 层一起 vendored 进来（上游路径
 * `registry/primitives/animate/slot`）。把传进来的那个元素就地升格成 motion 组件，
 * 于是动效属性能落到调用方给的标签上，而不是多包一层 div。
 *
 * 为什么放在 components/ 而不是 lib/：本包的 exports 映射里 `./lib/*` 与
 * `./hooks/*` 都只指向 .ts，而这个文件带 JSX（见 packages/ui/package.json）。
 *
 * 与上游的差别：
 * - 上游 `children?: any` 过不了本仓的 noExplicitAny（error），改成
 *   `ReactElement<Record<string, unknown>>`，并把「不是合法元素」的分支提到最前。
 * - 上游在 isValidElement 判定之前就读了 `children.type`，传进非元素会直接抛；
 *   这里先取一个可能为空的 elementType，useMemo 仍然无条件调用，顺序不变。
 */

import { cn } from "@automationstack/ui/lib/utils";
import { type HTMLMotionProps, isMotionComponent, motion } from "motion/react";
import type { CSSProperties, ReactElement } from "react";
import {
	type ElementType,
	isValidElement,
	type Ref,
	type RefCallback,
	type RefObject,
	useMemo,
} from "react";

type AnyProps = Record<string, unknown>;

type DOMMotionProps<T extends HTMLElement = HTMLElement> = Omit<
	HTMLMotionProps<keyof HTMLElementTagNameMap>,
	"ref"
> & { ref?: Ref<T> };

/**
 * `asChild: true` 时 children 必须是单个元素——Slot 要把属性搬到它身上，
 * 一段文本或一个数组没有可搬的落点。用联合类型把这条约束交给类型系统。
 */
type WithAsChild<Base extends object> =
	| (Base & { asChild: true; children: ReactElement })
	| (Base & { asChild?: false | undefined });

type SlotProps<T extends HTMLElement = HTMLElement> = {
	children?: ReactElement;
} & DOMMotionProps<T>;

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
	return (node) => {
		for (const ref of refs) {
			if (!ref) {
				continue;
			}
			if (typeof ref === "function") {
				ref(node);
			} else {
				(ref as RefObject<T | null>).current = node;
			}
		}
	};
}

/** className 与 style 要合并而不是覆盖：两边的样式都是有意写上去的。 */
function mergeProps<T extends HTMLElement>(
	childProps: AnyProps,
	slotProps: DOMMotionProps<T>
): AnyProps {
	const merged: AnyProps = { ...childProps, ...slotProps };

	if (childProps.className || slotProps.className) {
		merged.className = cn(
			childProps.className as string,
			slotProps.className as string
		);
	}

	if (childProps.style || slotProps.style) {
		merged.style = {
			...(childProps.style as CSSProperties),
			...(slotProps.style as CSSProperties),
		};
	}

	return merged;
}

function Slot<T extends HTMLElement = HTMLElement>({
	children,
	ref,
	...props
}: SlotProps<T>) {
	const elementType = isValidElement(children) ? children.type : undefined;
	const isAlreadyMotion =
		typeof elementType === "object" &&
		elementType !== null &&
		isMotionComponent(elementType);

	// motion.create 每次调用都产出新组件；不缓存的话每帧都是新类型，React 会
	// 卸载重挂，动画每帧从头开始。
	const Base = useMemo(() => {
		if (!elementType) {
			return null;
		}
		return isAlreadyMotion
			? (elementType as ElementType)
			: motion.create(elementType as ElementType);
	}, [isAlreadyMotion, elementType]);

	if (!(isValidElement(children) && Base)) {
		return null;
	}

	const { ref: childRef, ...childProps } = children.props as AnyProps;
	const mergedProps = mergeProps(childProps, props);

	return <Base {...mergedProps} ref={mergeRefs(childRef as Ref<T>, ref)} />;
}

export {
	type AnyProps,
	type DOMMotionProps,
	Slot,
	type SlotProps,
	type WithAsChild,
};
