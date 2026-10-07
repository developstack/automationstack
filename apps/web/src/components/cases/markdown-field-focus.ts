import { useEffect } from "react";

export function useFocusOut(
	container: HTMLDivElement | null,
	onFocusOut: () => void
) {
	useEffect(() => {
		const stillInside = () =>
			container?.contains(document.activeElement) ?? false;
		const handleFocusOut = (event: FocusEvent) => {
			const next = event.relatedTarget;
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
