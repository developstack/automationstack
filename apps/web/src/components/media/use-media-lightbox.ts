import { useCallback, useState } from "react";

import type { MediaOpenHandler } from "@/components/media/media-item";

interface LightboxState {
	index: number;
	origin: HTMLElement;
}

/** 缩略图打开的大图浏览：记录起始序号和被点击的缩略图，关闭后焦点回到这个缩略图。 */
export function useMediaLightbox() {
	const [state, setState] = useState<LightboxState | null>(null);
	const open = useCallback<MediaOpenHandler>(
		(index, origin) => setState({ index, origin }),
		[]
	);
	const close = useCallback(() => setState(null), []);
	return { close, open, state };
}
