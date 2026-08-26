"use client";

import { useEffect, useState } from "react";

/**
 * Returns true only on devices that have a true hover (mouse / trackpad).
 * Touch devices fire phantom `:hover` on tap that sticks until tap-elsewhere
 * — gate hover-only effects (scale lifts, magnetic pulls) behind this.
 */
export function useHoverCapable() {
	const [canHover, setCanHover] = useState(false);

	useEffect(() => {
		/*
		 * 「环境有没有 matchMedia」被压成 mq 是不是 null，effect 因此只剩一个
		 * 出口，consistent-return 报的那个「有时返回清理函数、有时什么都不返回」
		 * 也就不存在了。
		 *
		 * 不能照搬 use-run-shortcuts.ts 的写法：那边两条路径都拿得到 document，
		 * 差别只在挂不挂监听，所以能让所有路径返回同一个卸载函数。这里没有那个
		 * 前提——早退是因为 SSR / 老浏览器根本没有 matchMedia，mq 造不出来，也就
		 * 没有任何东西可以清理。同理也不给早退补 `return undefined` 或空函数：
		 * 那只是把不一致藏起来，读的人还得自己想「这里到底该不该清理」。
		 *
		 * 卸载函数里的 `mq?.` 对 null 天然是 no-op——没订上就没得退订，读一眼就
		 * 知道，不必回头翻上面的分支。`addEventListener?.` / `removeEventListener?.`
		 * 这层可选链是留给老 Safari 的（只有 addListener），与 mq 可空无关。
		 */
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
