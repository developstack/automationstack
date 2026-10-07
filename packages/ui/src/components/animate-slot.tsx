"use client";

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
