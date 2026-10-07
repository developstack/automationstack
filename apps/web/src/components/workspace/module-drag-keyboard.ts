import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import type {
	Collision,
	CollisionDetection,
	KeyboardCoordinateGetter,
} from "@dnd-kit/core";

import {
	parseDropId,
	resolveModuleDrop,
} from "@/components/workspace/module-drop-plan";

const ARROW_DOWN = "ArrowDown";
const ARROW_UP = "ArrowUp";
const HALF = 2;
const NOT_FOUND = -1;

interface ZoneRect {
	height: number;
	top: number;
}

interface ZoneCenter {
	id: string;
	y: number;
}

function centerY(rect: ZoneRect): number {
	return rect.top + rect.height / HALF;
}

function isReachableZone(
	tree: readonly ModuleTreeNode[],
	activeId: string,
	dropId: string
): boolean {
	const drop = parseDropId(dropId);
	if (drop === null || drop.moduleId === activeId) {
		return false;
	}
	return resolveModuleDrop(tree, activeId, drop).kind !== "invalid";
}

function sortedZones(
	rects: ReadonlyMap<string | number, ZoneRect>,
	activeId: string,
	tree: readonly ModuleTreeNode[]
): ZoneCenter[] {
	const zones: ZoneCenter[] = [];
	for (const [id, rect] of rects) {
		const key = String(id);
		if (isReachableZone(tree, activeId, key)) {
			zones.push({ id: key, y: centerY(rect) });
		}
	}
	zones.sort((left, right) => left.y - right.y);
	return zones;
}

function nearestIndex(zones: readonly ZoneCenter[], y: number): number {
	let best = NOT_FOUND;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const [index, zone] of zones.entries()) {
		const distance = Math.abs(zone.y - y);
		if (distance < bestDistance) {
			best = index;
			bestDistance = distance;
		}
	}
	return best;
}

function directionOf(code: string): number {
	if (code === ARROW_DOWN) {
		return 1;
	}
	return code === ARROW_UP ? -1 : 0;
}

export interface ModuleKeyboardDrag {
	collisionDetection: CollisionDetection;
	coordinateGetter: KeyboardCoordinateGetter;
	reset: () => void;
}

interface Cursor {
	id: string | null;
}

type TreeGetter = () => readonly ModuleTreeNode[];

function cursorIndex(
	cursor: Cursor,
	zones: readonly ZoneCenter[],
	y: number
): number {
	const held =
		cursor.id === null
			? NOT_FOUND
			: zones.findIndex((zone) => zone.id === cursor.id);
	return held === NOT_FOUND ? nearestIndex(zones, y) : held;
}

function makeCoordinateGetter(
	cursor: Cursor,
	getTree: TreeGetter
): KeyboardCoordinateGetter {
	return (event, { active, context, currentCoordinates }) => {
		let next: ReturnType<KeyboardCoordinateGetter> | undefined;
		const step = directionOf(event.code);
		const { collisionRect, droppableRects } = context;
		if (step !== 0 && collisionRect !== null) {
			event.preventDefault();
			const current = centerY(collisionRect);
			const zones = sortedZones(droppableRects, String(active), getTree());
			const target = zones[cursorIndex(cursor, zones, current) + step];
			if (target !== undefined) {
				cursor.id = target.id;
				next = {
					x: currentCoordinates.x,
					y: currentCoordinates.y + target.y - current,
				};
			}
		}
		return next;
	};
}

function makeCollisionDetection(
	cursor: Cursor,
	getTree: TreeGetter
): CollisionDetection {
	return ({ active, collisionRect, droppableRects }): Collision[] => {
		const zones = sortedZones(droppableRects, String(active.id), getTree());
		const zone = zones[cursorIndex(cursor, zones, centerY(collisionRect))];
		return zone === undefined ? [] : [{ id: zone.id }];
	};
}

export function createModuleKeyboardDrag(
	getTree: TreeGetter
): ModuleKeyboardDrag {
	const cursor: Cursor = { id: null };
	return {
		collisionDetection: makeCollisionDetection(cursor, getTree),
		coordinateGetter: makeCoordinateGetter(cursor, getTree),
		reset: () => {
			cursor.id = null;
		},
	};
}
