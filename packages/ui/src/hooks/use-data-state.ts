import {
	type Ref,
	type RefObject,
	useEffect,
	useImperativeHandle,
	useRef,
	useSyncExternalStore,
} from "react";

export type DataStateValue = boolean | string | null;

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

	const getSnapshot = (): DataStateValue => {
		const el: HTMLElement | null = localRef.current;
		return el === null
			? null
			: parseDatasetValue(el.getAttribute(`data-${key}`));
	};

	const subscribe = (callback: () => void) => {
		const el: HTMLElement | null = localRef.current;
		if (el === null) {
			// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
			return () => {};
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
