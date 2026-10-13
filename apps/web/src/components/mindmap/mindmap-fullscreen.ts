import type { MindElixirInstance } from "mind-elixir";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import type { MindmapFullscreen } from "./mindmap-toolbar.tsx";

const TRANSLATE_PATTERN = /translate3d\(([^,]+),\s*([^,]+)/;

function readTranslate(mind: MindElixirInstance) {
	const match = mind.map.style.transform.match(TRANSLATE_PATTERN);
	return match
		? {
				x: Number.parseFloat(match[1] ?? "0"),
				y: Number.parseFloat(match[2] ?? "0"),
			}
		: { x: 0, y: 0 };
}

const HALF = 2;

function centerOf(rect: DOMRect) {
	return { x: rect.width / HALF, y: rect.height / HALF };
}

/**
 * 记下画布中心对应的脑图位置，返回的函数在尺寸变化后把这个位置移回中心。
 * 与 mind-elixir 自带工具栏的全屏按钮做法相同。
 */
function keepViewportCenter(mind: MindElixirInstance): () => void {
	const before = centerOf(mind.container.getBoundingClientRect());
	const translate = readTranslate(mind);
	const mapX = (before.x - translate.x) / mind.scaleVal;
	const mapY = (before.y - translate.y) / mind.scaleVal;
	return () => {
		const after = centerOf(mind.container.getBoundingClientRect());
		const current = readTranslate(mind);
		mind.move(
			after.x - mapX * mind.scaleVal - current.x,
			after.y - mapY * mind.scaleVal - current.y
		);
	};
}

/** 全屏显示画布和工具栏所在的外框。退出全屏后画布中心的位置不变。 */
export function useMindmapFullscreen(
	frameRef: RefObject<HTMLElement | null>,
	mind: MindElixirInstance | null
): MindmapFullscreen {
	const [active, setActive] = useState(false);
	const restoreRef = useRef<(() => void) | null>(null);
	const supported =
		typeof document !== "undefined" && document.fullscreenEnabled === true;

	useEffect(() => {
		const handleChange = () => {
			setActive(
				frameRef.current !== null &&
					document.fullscreenElement === frameRef.current
			);
			restoreRef.current?.();
			restoreRef.current = null;
		};
		document.addEventListener("fullscreenchange", handleChange);
		return () => document.removeEventListener("fullscreenchange", handleChange);
	}, [frameRef]);

	const toggle = useCallback(() => {
		const frame = frameRef.current;
		if (frame === null || mind === null) {
			return;
		}
		restoreRef.current = keepViewportCenter(mind);
		const request =
			document.fullscreenElement === frame
				? document.exitFullscreen()
				: frame.requestFullscreen();
		request.catch(() => {
			restoreRef.current = null;
		});
	}, [frameRef, mind]);

	return { active, supported, toggle };
}
