/**
 * Animate UI 各 primitive 共用的「必须在 Provider 内使用」上下文工厂。
 * 随 animate-ui 的 base primitives 一起 vendored 进来（上游路径
 * `registry/lib/get-strict-context`），下面的组件文件按原样调用它。
 *
 * 与上游的唯一差别：Provider 用 `createElement` 而不是 JSX 写。
 * 本包的 exports 映射里 `./lib/*` 只指向 `.ts`（见 packages/ui/package.json），
 * 保持无 JSX 就不必为一个小工具函数去改对外的导出面。
 */
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

/**
 * 返回 [Provider, useContext] 二元组。取不到值时抛错而不是回落到默认值：
 * 这些 primitive 的子组件脱离 Root 就没有任何合理行为，静默返回 undefined
 * 只会把错误推迟到某个属性访问上，堆栈里再也看不出根因。
 */
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
