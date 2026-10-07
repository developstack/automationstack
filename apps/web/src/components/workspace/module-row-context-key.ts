const CONTEXT_MENU_KEY = "ContextMenu";
const F10_KEY = "F10";

const ROW_GUTTER_PX = 8;

interface ContextMenuKeyEvent {
	key: string;
	shiftKey: boolean;
}

interface RowRect {
	bottom: number;
	left: number;
}

export interface ContextMenuPoint {
	x: number;
	y: number;
}

export function isContextMenuKey(event: ContextMenuKeyEvent): boolean {
	return (
		event.key === CONTEXT_MENU_KEY || (event.key === F10_KEY && event.shiftKey)
	);
}

export function contextMenuPointFromRect(rect: RowRect): ContextMenuPoint {
	return { x: rect.left + ROW_GUTTER_PX, y: rect.bottom };
}
