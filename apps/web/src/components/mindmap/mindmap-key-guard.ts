export interface MindmapKeyEvent {
	altKey: boolean;
	ctrlKey: boolean;
	key: string;
	metaKey: boolean;
	shiftKey: boolean;
}

const LAYOUT_KEYS_IGNORING_ALT = new Set(["ArrowLeft", "ArrowRight"]);

const SIDE_LAYOUT_KEY = "ArrowUp";

const LAYER_COLLAPSE_KEY = "k";

export function shouldBlockMindmapKey(event: MindmapKeyEvent): boolean {
	if (!(event.metaKey || event.ctrlKey)) {
		return false;
	}
	if (event.key === SIDE_LAYOUT_KEY) {
		return !event.altKey;
	}
	return (
		LAYOUT_KEYS_IGNORING_ALT.has(event.key) || event.key === LAYER_COLLAPSE_KEY
	);
}

const CAPTURE: AddEventListenerOptions = { capture: true };

export function bindMindmapKeyGuard(root: HTMLElement): () => void {
	const onKeyDown = (event: KeyboardEvent) => {
		if (!shouldBlockMindmapKey(event)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
	};

	root.addEventListener("keydown", onKeyDown, CAPTURE);
	return () => {
		root.removeEventListener("keydown", onKeyDown, CAPTURE);
	};
}
