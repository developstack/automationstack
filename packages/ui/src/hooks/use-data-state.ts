/**
 * 订阅某个 DOM 元素上 `data-<key>` 属性的当前值，随 animate-ui 的 base
 * primitives 一起 vendored 进来（上游路径 `registry/hooks/use-data-state`）。
 *
 * 存在的理由：Base UI 的状态（highlighted / open / checked …）是以 data 属性
 * 的形式落在真实节点上的，而动效层需要在 React 之外读到这些状态。用
 * MutationObserver + useSyncExternalStore 订阅，而不是把状态在 React 里再存
 * 一份——后者必然与 Base UI 的内部状态漂移。
 */
import {
	type Ref,
	type RefObject,
	useEffect,
	useImperativeHandle,
	useRef,
	useSyncExternalStore,
} from "react";

export type DataStateValue = boolean | string | null;

/** 空串与 "true" 都算真：Base UI 的布尔态属性写的是 `data-open=""`。 */
function parseDatasetValue(value: string | null): DataStateValue {
	if (value === null) {
		return null;
	}
	if (value === "" || value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	return value;
}

export function useDataState<T extends HTMLElement = HTMLElement>(
	key: string,
	forwardedRef?: Ref<T | null>,
	onChange?: (value: DataStateValue) => void
): [DataStateValue, RefObject<T | null>] {
	const localRef = useRef<T | null>(null);
	useImperativeHandle(forwardedRef, () => localRef.current as T);

	// 局部变量显式标成 HTMLElement | null 而不是让它继承泛型 T：Biome 的
	// noUnnecessaryConditions 在 `useRef<T | null>` 的泛型上会把同一个值先后判成
	// 「恒真」和「恒假」（自相矛盾），给它一个具体的联合类型就正常收窄了。
	const getSnapshot = (): DataStateValue => {
		const el: HTMLElement | null = localRef.current;
		return el === null
			? null
			: parseDatasetValue(el.getAttribute(`data-${key}`));
	};

	const subscribe = (callback: () => void) => {
		const el: HTMLElement | null = localRef.current;
		if (el === null) {
			return () => {
				// 元素还没挂上，没有可断开的订阅。
			};
		}
		const observer = new MutationObserver(callback);
		observer.observe(el, {
			attributeFilter: [`data-${key}`],
			attributes: true,
		});
		return () => observer.disconnect();
	};

	const value = useSyncExternalStore(subscribe, getSnapshot);

	useEffect(() => {
		onChange?.(value);
	}, [value, onChange]);

	return [value, localRef];
}
