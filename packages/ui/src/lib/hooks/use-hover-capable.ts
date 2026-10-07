"use client";

import { useEffect, useState } from "react";

export function useHoverCapable() {
	const [canHover, setCanHover] = useState(false);

	useEffect(() => {
		const mq =
			typeof window === "undefined" || !window.matchMedia
				? null
				: window.matchMedia("(hover: hover) and (pointer: fine)");
		const update = () => setCanHover(mq?.matches ?? false);
		if (mq) {
			update();
			mq.addEventListener?.("change", update);
		}
		return () => mq?.removeEventListener?.("change", update);
	}, []);

	return canHover;
}
