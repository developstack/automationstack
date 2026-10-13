import { type KeyboardEvent, useCallback, useRef, useState } from "react";

/**
 * 工具栏的键盘焦点（roving tabindex）：只有一个按钮在 Tab 顺序中，
 * 左右方向键在按钮之间循环移动焦点。
 */
export function useRovingIndex(count: number) {
	const [activeIndex, setActiveIndex] = useState(0);
	const activeRef = useRef(0);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

	const move = useCallback(
		(delta: number) => {
			const next = (activeRef.current + delta + count) % count;
			activeRef.current = next;
			setActiveIndex(next);
			buttonsRef.current[next]?.focus();
		},
		[count]
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			if (event.key === "ArrowRight") {
				event.preventDefault();
				move(1);
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				move(-1);
			}
		},
		[move]
	);

	const register = useCallback(
		(index: number, node: HTMLButtonElement | null) => {
			buttonsRef.current[index] = node;
		},
		[]
	);

	return { activeIndex, handleKeyDown, register };
}
