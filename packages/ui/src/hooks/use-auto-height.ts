import {
	type DependencyList,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

interface AutoHeightOptions {
	includeParentBox?: boolean;
	includeSelfBox?: boolean;
}

function verticalBoxExtra(element: Element): number {
	const style = getComputedStyle(element);
	if (style.boxSizing !== "border-box") {
		return 0;
	}
	const padding =
		(Number.parseFloat(style.paddingTop || "0") || 0) +
		(Number.parseFloat(style.paddingBottom || "0") || 0);
	const border =
		(Number.parseFloat(style.borderTopWidth || "0") || 0) +
		(Number.parseFloat(style.borderBottomWidth || "0") || 0);
	return padding + border;
}

export function useAutoHeight<T extends HTMLElement = HTMLDivElement>(
	deps: DependencyList = [],
	options: AutoHeightOptions = {}
) {
	const { includeParentBox = true, includeSelfBox = false } = options;
	const ref = useRef<T | null>(null);
	const [height, setHeight] = useState(0);

	const measure = useCallback(() => {
		const el: HTMLElement | null = ref.current;
		if (!el) {
			return 0;
		}

		const base = el.getBoundingClientRect().height || 0;
		let extra = 0;
		if (includeParentBox && el.parentElement) {
			extra += verticalBoxExtra(el.parentElement);
		}
		if (includeSelfBox) {
			extra += verticalBoxExtra(el);
		}

		const dpr =
			typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
		return Math.ceil((base + extra) * dpr) / dpr;
	}, [includeParentBox, includeSelfBox]);

	useLayoutEffect(() => {
		const observer = new ResizeObserver(() => {
			const next = measure();
			requestAnimationFrame(() => setHeight(next));
		});

		const el: HTMLElement | null = ref.current;
		if (el) {
			setHeight(measure());
			observer.observe(el);
			if (includeParentBox && el.parentElement) {
				observer.observe(el.parentElement);
			}
		}

		return () => observer.disconnect();
	}, [measure, includeParentBox, ...deps]);

	useLayoutEffect(() => {
		if (height === 0) {
			const next = measure();
			if (next !== 0) {
				setHeight(next);
			}
		}
	}, [height, measure]);

	return { height, ref } as const;
}
