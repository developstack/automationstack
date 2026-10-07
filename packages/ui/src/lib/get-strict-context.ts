import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
} from "react";

interface StrictProviderProps<T> {
	children?: ReactNode;
	value: T;
}

export function getStrictContext<T>(
	name?: string
): readonly [(props: StrictProviderProps<T>) => ReactNode, () => T] {
	const Context = createContext<T | undefined>(undefined);

	const Provider = ({ children, value }: StrictProviderProps<T>): ReactNode =>
		createElement(Context.Provider, { value }, children);

	const useSafeContext = (): T => {
		const ctx = useContext(Context);
		if (ctx === undefined) {
			throw new Error(`useContext 必须在 ${name ?? "对应的 Provider"} 内使用`);
		}
		return ctx;
	};

	return [Provider, useSafeContext] as const;
}
