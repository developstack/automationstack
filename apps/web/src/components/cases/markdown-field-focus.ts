/**
 * `markdown-field.tsx` 的焦点离场判定。
 *
 * 单独成文件是为了给 markdown-field.tsx 留出行数余量（单文件上限 300 行），
 * 它本身只服务那一个组件，不是通用 hook。
 */
import { useEffect } from "react";

/**
 * 焦点离开整个字段（含工具条、预览）时退回未聚焦态。
 *
 * 交接竞态：mode 置为 "editing" 后 React 会把**正持有焦点的** textarea 从 DOM 摘掉，
 * 焦点要等编辑器挂好、`editor.focus()` 跑完才补回来。这中间浏览器会为被摘掉的
 * textarea 派发一次 focusout，且 `relatedTarget` 为 null（Chrome 实测如此，
 * 各家行为并不一致）。照字面处理就会立刻退回 textarea，编辑器永远进不去。
 * 所以 relatedTarget 为 null 时不当场下结论，等交接跑完再看焦点落在哪：
 * 只要焦点回到了本字段容器里，就当没离开过。
 */
export function useFocusOut(
	container: HTMLDivElement | null,
	onFocusOut: () => void
) {
	useEffect(() => {
		const stillInside = () =>
			container?.contains(document.activeElement) ?? false;
		const handleFocusOut = (event: FocusEvent) => {
			const next = event.relatedTarget;
			// 工具条按钮也在这个容器里，点它们不算离开本字段。
			if (next instanceof Node && container?.contains(next)) {
				return;
			}
			if (next !== null) {
				onFocusOut();
				return;
			}
			requestAnimationFrame(() => {
				if (stillInside()) {
					return;
				}
				// 再等一帧：编辑器 chunk 已预取，但 Suspense 解挂 + effect 落焦
				// 未必赶得上第一帧。
				requestAnimationFrame(() => {
					if (!stillInside()) {
						onFocusOut();
					}
				});
			});
		};
		container?.addEventListener("focusout", handleFocusOut);
		return () => container?.removeEventListener("focusout", handleFocusOut);
	}, [container, onFocusOut]);
}
