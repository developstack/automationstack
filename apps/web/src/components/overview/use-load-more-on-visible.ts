import { type RefObject, useEffect } from "react";

/**
 * 列表末尾的元素滚动到可见时调用 onVisible，用于滚动到底部时加载下一页。
 * 浏览器不支持 IntersectionObserver 时什么都不做，用户可以点「加载更早的记录」。
 */
export function useLoadMoreOnVisible(
	target: RefObject<Element | null>,
	enabled: boolean,
	onVisible: () => void
): void {
	useEffect(() => {
		const element = target.current;
		const supported = typeof IntersectionObserver !== "undefined";
		if (!(enabled && element && supported)) {
			return () => undefined;
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				onVisible();
			}
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [enabled, onVisible, target]);
}
