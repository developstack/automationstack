import {
	buildModuleTree,
	type ModuleTreeNode,
} from "@automationstack/api/lib/module-tree";
import type { Active, ClientRect, SensorContext } from "@dnd-kit/core";
import { expect, test } from "vitest";

import { createModuleKeyboardDrag } from "@/components/workspace/module-drag-keyboard";

const CELL_SEPARATOR = /\s+/;
const LEAF_ID = "c";
const PARENT_ID = "b";
const ROOT_ID = "a";

function parseRect(line: string): [string, ClientRect] {
	const [id = "", ...cells] = line.trim().split(CELL_SEPARATOR);
	const [top = 0, height = 0, left = 0, width = 0] = cells.map(Number);
	const bottom = top + height;
	return [id, { bottom, height, left, right: left + width, top, width }];
}

function parseRects(table: string): Map<string, ClientRect> {
	return new Map(table.trim().split("\n").map(parseRect));
}

function makeTree(spec: string): ModuleTreeNode[] {
	const parents = new Map<string, string | null>();
	for (const entry of spec.split(" ")) {
		const [parent = "", rawChildren = ""] = entry.split(">");
		parents.set(parent, parents.get(parent) ?? null);
		for (const child of rawChildren === "" ? [] : rawChildren.split(",")) {
			parents.set(child, parent);
		}
	}
	return buildModuleTree(
		[...parents].map(([id, parentId], index) => ({
			id,
			name: id,
			parentId,
			projectId: "11111111-1111-4111-8111-111111111111",
			sortOrder: index,
		}))
	);
}

const TREE = makeTree("a>b,e,g b>c,d e>f g>h");

const [, LEAF_ROW] = parseRect("row 193 28 32 216");
const [, PARENT_ROW] = parseRect("row 159 28 20 228");
const [, ROOT_ROW] = parseRect("row 125 28 8 240");

const TREE_TABLE = `
before:a 119 6 8 240
inside:a 129 20 68 148
before:b 153 6 20 228
inside:b 163 20 80 136
before:c 187 6 32 216
inside:c 197 20 92 124
before:d 221 6 32 216
inside:d 231 20 92 124
before:e 255 6 20 228
inside:e 265 20 80 136
before:f 289 6 32 216
inside:f 299 20 92 124
before:g 323 6 20 228
inside:g 333 20 80 136
before:h 357 6 32 216
inside:h 367 20 92 124
root-end 391 16 8 240
`;

interface DragOptions {
	activeId?: string;
	activeRow?: ClientRect;
	hold?: boolean;
	table?: string;
	tree?: readonly ModuleTreeNode[];
}

function driver(options: DragOptions = {}) {
	const rects = parseRects(options.table ?? TREE_TABLE);
	const activeId = options.activeId ?? LEAF_ID;
	const tree = options.tree ?? TREE;
	const drag = createModuleKeyboardDrag(() => tree);
	let rect = options.activeRow ?? LEAF_ROW;
	return {
		drag,
		over: (): string =>
			String(
				drag.collisionDetection({
					active: { id: activeId } as unknown as Active,
					collisionRect: rect,
					droppableContainers: [],
					droppableRects: rects,
					pointerCoordinates: null,
				})[0]?.id ?? "(none)"
			),
		press: (code: string) => {
			const event = { code, preventDefault: () => undefined };
			const next = drag.coordinateGetter(event as unknown as KeyboardEvent, {
				active: activeId,
				context: {
					collisionRect: rect,
					droppableRects: rects,
				} as unknown as SensorContext,
				currentCoordinates: { x: rect.left, y: rect.top },
			});
			if (next && options.hold !== true) {
				[, rect] = parseRect(
					`moved ${next.y} ${rect.height} ${next.x} ${rect.width}`
				);
			}
			return next;
		},
	};
}

function walk(code: string, presses: number, options?: DragOptions): string[] {
	const run = driver(options);
	const visited = [run.over()];
	for (const _ of Array.from({ length: presses })) {
		run.press(code);
		visited.push(run.over());
	}
	return visited;
}

function expectPath(
	code: string,
	expected: string,
	options?: DragOptions
): string[] {
	const visited = walk(code, expected.split(" ").length - 1, options);
	expect(visited.join(" ")).toBe(expected);
	return visited;
}

function consecutiveRepeats(ids: readonly string[]): string[] {
	return ids.filter((id, index) => index > 0 && id === ids[index - 1]);
}

const STEPS_PAST_END = 14;
const REACHABLE_DOWNWARDS = 11;
const REACHABLE_UPWARDS = 5;
function allReachable(options?: DragOptions): Set<string> {
	const down = walk("ArrowDown", STEPS_PAST_END, options);
	const up = walk("ArrowUp", STEPS_PAST_END, options);
	return new Set([...down, ...up]);
}

function without(excluded: string): Set<string> {
	const dropped = excluded.split(" ");
	const ids = [...parseRects(TREE_TABLE).keys()];
	return new Set(ids.filter((id) => !dropped.includes(id)));
}

test.each([
	[
		"向下每按一次恰好推进一个落点，不重复也不跳过",
		"ArrowDown",
		"before:d inside:d before:e inside:e before:f inside:f before:g inside:g before:h inside:h root-end",
	],
	[
		"向上是向下的镜像，同样不重复不跳过",
		"ArrowUp",
		"before:d inside:b before:b inside:a before:a",
	],
])("%s", (_name, code, path) => {
	expect(consecutiveRepeats(expectPath(code, path))).toEqual([]);
});

test("走到序列尾部后停住，不回绕也不越界", () => {
	const visited = walk("ArrowDown", STEPS_PAST_END);
	expect(visited.at(-1)).toBe("root-end");
	expect(new Set(visited).size).toBe(REACHABLE_DOWNWARDS);
	expect(new Set(consecutiveRepeats(visited))).toEqual(new Set(["root-end"]));
});

test("走到序列头部后停住", () => {
	const visited = walk("ArrowUp", STEPS_PAST_END);
	expect(visited.at(-1)).toBe("before:a");
	expect(new Set(visited).size).toBe(REACHABLE_UPWARDS);
});

test("被拖模块自身的两个落点不出现在序列里，其余全部可达", () => {
	expect(allReachable()).toEqual(without("before:c inside:c"));
});

test("排除的是「同一个 moduleId」而不是 id 后缀", () => {
	const table = `
before:xb 119 6 8 240
inside:xb 129 20 68 148
before:b 153 6 20 228
inside:b 163 20 80 136
before:c 187 6 32 216
`;
	expectPath("ArrowUp", "before:c inside:xb before:xb before:xb", {
		activeId: PARENT_ID,
		activeRow: PARENT_ROW,
		table,
		tree: makeTree("xb b c"),
	});
});

test("中心 y 完全相同的落点各自占一步，不会被并成一步", () => {
	const table = `
before:b 153 6 20 228
inside:b 163 20 80 136
before:c 187 6 32 216
before:d 187 6 8 240
inside:d 231 20 92 124
root-end 391 16 8 240
`;
	expectPath("ArrowDown", "before:c before:d inside:d root-end root-end", {
		activeId: PARENT_ID,
		activeRow: PARENT_ROW,
		table,
		tree: makeTree("b c d"),
	});
});

test("推进后的坐标把碰撞矩形中心精确落在目标落点中心上", () => {
	const [, expected] = parseRect("expected 227 28 32 216");
	expect(driver().press("ArrowDown")).toEqual({
		x: expected.left,
		y: expected.top,
	});
});

test("reset 之后重新按几何落座，不带上一次拖拽的游标", () => {
	const run = driver({ hold: true });
	run.press("ArrowDown");
	expect(run.over()).toBe("inside:d");
	run.drag.reset();
	expect(run.over()).toBe("before:d");
});

test("拖父模块时子孙落点整段跳过，其余落点一个不少", () => {
	const options = { activeId: PARENT_ID, activeRow: PARENT_ROW };
	expect(allReachable(options)).toEqual(
		without("before:b inside:b before:c inside:c before:d inside:d")
	);
	expectPath("ArrowDown", "inside:a before:e inside:e", options);
});

test("拖根模块时只剩下根层级末尾一个落点，且序列不为空", () => {
	const options = { activeId: ROOT_ID, activeRow: ROOT_ROW };
	expectPath("ArrowDown", "root-end root-end root-end", options);
	expect(allReachable(options)).toEqual(new Set(["root-end"]));
});

test("被拖模块不在树里时退回「只排除自身落点」，不会把落点滤空", () => {
	const options = {
		activeId: PARENT_ID,
		activeRow: PARENT_ROW,
		tree: makeTree("z"),
	};
	expect(allReachable(options)).toEqual(without("before:b inside:b"));
});
