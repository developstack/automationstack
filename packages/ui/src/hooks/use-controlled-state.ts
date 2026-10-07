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
