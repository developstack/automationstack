"use client";

import { useEffect, useState } from "react";

/**
 * 侧边栏塌成抽屉的阈值，与 Tailwind 的 `lg` 断点（64rem）保持一致。
 *
 * 取 1024 而不是常见的 768：断点由内容定，不由设备定——侧边栏固定 16rem，
 * 里面还要放模块树，1024px 以下留给主内容的宽度已经压不住用例表格。
 * 改这个值必须同步改 sidebar.tsx 里的 `lg:` 前缀，两者是同一个断点的两种写法。
 */
const COMPACT_BREAKPOINT_PX = 1024;

/**
 * 视口是否窄到该用抽屉。
 *
 * SSR 与首帧一律返回 false（按宽屏渲染）：服务端量不到视口，
 * 猜错会导致水合不一致。真正的宽窄由 CSS 的 `lg:` 前缀承担，
 * 这个 hook 只用来决定「点触发器时开抽屉还是收面板」这类 JS 行为。
 */
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
