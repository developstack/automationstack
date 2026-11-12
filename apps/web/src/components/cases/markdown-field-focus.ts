import { useEffect } from "react";

import type { FieldFocusLoss } from "@/components/cases/use-markdown-field-activation";

export function useFocusOut(
	container: HTMLDivElement | null,
	onFocusOut: (loss: FieldFocusLoss) => void
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
				onFocusOut("moved");
				return;
			}
			requestAnimationFrame(() => {
				if (stillInside()) {
					return;
				}
				requestAnimationFrame(() => {
					if (!stillInside()) {
						onFocusOut("lost");
					}
				});
			});
		};
		container?.addEventListener("focusout", handleFocusOut);
		return () => container?.removeEventListener("focusout", handleFocusOut);
	}, [container, onFocusOut]);
}
