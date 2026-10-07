import type { MindElixirInstance } from "mind-elixir";

const CLICK_SLOP_PX = 5;

const PRIMARY_BUTTON = 0;

const MOUSE_POINTER = "mouse";

export const MINDMAP_PANNING_CLASS = "mindmap-panning";

export interface MindmapPanPointer {
	button: number;
	clientX: number;
	clientY: number;
	ctrlKey: boolean;
	metaKey: boolean;
	pointerId: number;
	pointerType: string;
	target: unknown;
}

export interface MindmapPanEffects {
	capturePointer: (pointerId: number) => void;
	isCanvasTarget: (target: unknown) => boolean;
	move: (dx: number, dy: number) => void;
	onCanvasClick: () => void;
	releasePointer: (pointerId: number) => void;
	setPanning: (panning: boolean) => void;
}

export interface MindmapPanController {
	cancel: () => void;
	down: (pointer: MindmapPanPointer) => boolean;
	drag: (pointer: MindmapPanPointer) => void;
	end: (pointer: MindmapPanPointer) => void;
}

interface PanState {
	keepSelection: boolean;
	lastX: number;
	lastY: number;
	moved: boolean;
	originX: number;
	originY: number;
	pointerId: number;
}

function canStartPan(
	pointer: MindmapPanPointer,
	effects: MindmapPanEffects
): boolean {
	return (
		pointer.button === PRIMARY_BUTTON &&
		pointer.pointerType === MOUSE_POINTER &&
		effects.isCanvasTarget(pointer.target)
	);
}

function toPanState(pointer: MindmapPanPointer): PanState {
	return {
		keepSelection: pointer.ctrlKey || pointer.metaKey,
		lastX: pointer.clientX,
		lastY: pointer.clientY,
		moved: false,
		originX: pointer.clientX,
		originY: pointer.clientY,
		pointerId: pointer.pointerId,
	};
}

function exceedsSlop(state: PanState, pointer: MindmapPanPointer): boolean {
	const dx = pointer.clientX - state.originX;
	const dy = pointer.clientY - state.originY;
	return Math.hypot(dx, dy) > CLICK_SLOP_PX;
}

interface PanSession {
	effects: MindmapPanEffects;
	state: PanState | null;
}

function settle(session: PanSession): PanState | null {
	if (session.state === null) {
		return null;
	}
	const finished = session.state;
	session.state = null;
	session.effects.setPanning(false);
	return finished;
}

function owns(session: PanSession, pointer: MindmapPanPointer): boolean {
	return (
		session.state !== null && session.state.pointerId === pointer.pointerId
	);
}

function handleDown(session: PanSession, pointer: MindmapPanPointer): boolean {
	if (session.state !== null || !canStartPan(pointer, session.effects)) {
		return false;
	}
	session.state = toPanState(pointer);
	session.effects.capturePointer(pointer.pointerId);
	session.effects.setPanning(true);
	return true;
}

function handleDrag(session: PanSession, pointer: MindmapPanPointer): void {
	const { state } = session;
	if (state === null || !owns(session, pointer)) {
		return;
	}
	const dx = pointer.clientX - state.lastX;
	const dy = pointer.clientY - state.lastY;
	state.lastX = pointer.clientX;
	state.lastY = pointer.clientY;
	state.moved = state.moved || exceedsSlop(state, pointer);
	session.effects.move(dx, dy);
}

function handleEnd(session: PanSession, pointer: MindmapPanPointer): void {
	if (!owns(session, pointer)) {
		return;
	}
	session.effects.releasePointer(pointer.pointerId);
	const finished = settle(session);
	if (finished !== null && !(finished.moved || finished.keepSelection)) {
		session.effects.onCanvasClick();
	}
}

export function createMindmapPanController(
	effects: MindmapPanEffects
): MindmapPanController {
	const session: PanSession = { effects, state: null };

	return {
		cancel: () => {
			settle(session);
		},
		down: (pointer) => handleDown(session, pointer),
		drag: (pointer) => {
			handleDrag(session, pointer);
		},
		end: (pointer) => {
			handleEnd(session, pointer);
		},
	};
}

const CAPTURE: AddEventListenerOptions = { capture: true };

function createPanEffects(mind: MindElixirInstance): MindmapPanEffects {
	const canvas = mind.container;
	return {
		capturePointer: (pointerId) => {
			canvas.setPointerCapture(pointerId);
		},
		isCanvasTarget: (target) => target === canvas,
		move: (dx, dy) => {
			mind.move(dx, dy);
		},
		onCanvasClick: () => {
			mind.clearSelection();
		},
		releasePointer: (pointerId) => {
			if (canvas.hasPointerCapture(pointerId)) {
				canvas.releasePointerCapture(pointerId);
			}
		},
		setPanning: (panning) => {
			canvas.classList.toggle(MINDMAP_PANNING_CLASS, panning);
		},
	};
}

export function bindMindmapPan(
	root: HTMLElement,
	mind: MindElixirInstance
): () => void {
	const controller = createMindmapPanController(createPanEffects(mind));
	const onPointerDown = (event: PointerEvent) => {
		if (controller.down(event)) {
			event.stopPropagation();
		}
	};
	const onPointerMove = (event: PointerEvent) => {
		controller.drag(event);
	};
	const onPointerUp = (event: PointerEvent) => {
		controller.end(event);
	};
	const onPointerCancel = () => {
		controller.cancel();
	};

	root.addEventListener("pointerdown", onPointerDown, CAPTURE);
	root.addEventListener("pointermove", onPointerMove, CAPTURE);
	root.addEventListener("pointerup", onPointerUp, CAPTURE);
	root.addEventListener("pointercancel", onPointerCancel, CAPTURE);
	return () => {
		controller.cancel();
		root.removeEventListener("pointerdown", onPointerDown, CAPTURE);
		root.removeEventListener("pointermove", onPointerMove, CAPTURE);
		root.removeEventListener("pointerup", onPointerUp, CAPTURE);
		root.removeEventListener("pointercancel", onPointerCancel, CAPTURE);
	};
}
