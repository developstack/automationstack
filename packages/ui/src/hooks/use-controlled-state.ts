/**
 * 受控 / 非受控二选一的状态钩子，随 animate-ui 的 base primitives 一起
 * vendored 进来（上游路径 `registry/hooks/use-controlled-state`）。
 *
 * 传了 `value` 就跟着外部走，没传就自己存一份 `defaultValue`；两种模式下
 * `onChange` 都会被调用，所以调用方不需要为受控与否写两套代码。
 */
import { useCallback, useEffect, useState } from "react";

interface ControlledStateProps<T, Rest extends unknown[]> {
	defaultValue?: T;
	onChange?: (value: T, ...args: Rest) => void;
	value?: T;
}

export function useControlledState<T, Rest extends unknown[] = []>(
	props: ControlledStateProps<T, Rest>
): readonly [T, (next: T, ...args: Rest) => void] {
	const { defaultValue, onChange, value } = props;

	const [state, setInternalState] = useState<T>(
		value === undefined ? (defaultValue as T) : value
	);

	// 受控模式下把外部值同步进来。非受控（value 恒为 undefined）时这条不做事，
	// 内部 state 才是唯一出处。
	useEffect(() => {
		if (value !== undefined) {
			setInternalState(value);
		}
	}, [value]);

	const setState = useCallback(
		(next: T, ...args: Rest) => {
			setInternalState(next);
			onChange?.(next, ...args);
		},
		[onChange]
	);

	return [state, setState] as const;
}
