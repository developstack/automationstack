import type { MindElixirInstance } from "mind-elixir";
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export interface MindmapFullscreen {
	active: boolean;
	toggle: () => void;
}

const TRANSLATE_PATTERN = /translate3d\(([^,]+),\s*([^,]+)/;
const HALF = 2;

/** mind-elixir 把平移写在画布的 transform 中，自带工具栏的全屏按钮也这样读取。 */
function readTranslate(mind: MindElixirInstance) {
	const match = mind.map.style.transform.match(TRANSLATE_PATTERN);
	return match
		? {
				x: Number.parseFloat(match[1] ?? "0"),
				y: Number.parseFloat(match[2] ?? "0"),
			}
		: { x: 0, y: 0 };
}

function centerOf(rect: DOMRect) {
	return { x: rect.width / HALF, y: rect.height / HALF };
}

/** 记下画布中心对应的脑图位置，返回的函数在尺寸变化后把这个位置移回中心。 */
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

/**
 * 全屏：画布和工具栏铺满浏览器窗口，按 Esc 或「退出全屏」恢复，画布中心的位置不变。
 * 不使用浏览器的全屏接口：全屏元素之外的对话框和提示不显示，删除确认会看不到。
 */
export function useMindmapFullscreen(
	mind: MindElixirInstance | null
): MindmapFullscreen {
	const [active, setActive] = useState(false);

	const toggle = useCallback(() => {
		const restore = mind === null ? null : keepViewportCenter(mind);
		// 先同步提交新的布局，再按新的画布尺寸把中心移回原位
		flushSync(() => setActive((current) => !current));
		restore?.();
	}, [mind]);

	useEffect(() => {
		// 编辑节点时的 Esc 由 mind-elixir 处理并 preventDefault，不退出全屏
		const handleKeyDown = (event: KeyboardEvent) => {
			if (active && event.key === "Escape" && !event.defaultPrevented) {
				toggle();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [active, toggle]);

	return { active, toggle };
}
