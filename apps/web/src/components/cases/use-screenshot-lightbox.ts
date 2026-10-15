import { useCallback, useState } from "react";

interface LightboxState {
	index: number;
	origin: HTMLElement;
}

/** 缩略图打开的图片弹窗：记录起始图片和被点击的缩略图，关闭后焦点回到这个缩略图。 */
export function useScreenshotLightbox() {
	const [state, setState] = useState<LightboxState | null>(null);
	const open = useCallback(
		(index: number, origin: HTMLElement) => setState({ index, origin }),
		[]
	);
	const close = useCallback(() => setState(null), []);
	return { close, open, state };
}
