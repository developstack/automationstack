"use client";

import { useEffect, useState } from "react";

const COMPACT_BREAKPOINT_PX = 1024;

export function useCompactViewport(): boolean {
	const [isCompact, setIsCompact] = useState(false);

	useEffect(() => {
		const query = window.matchMedia(
			`(max-width: ${COMPACT_BREAKPOINT_PX - 1}px)`
		);
		const sync = () => setIsCompact(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);

	return isCompact;
}
