/**
 * 键盘拖拽落点序列的回归测试。
 * 几何表是真机量出来的（Chrome，8 模块的演示项目）：`id top height left width`。
 * 关键在于横向——每层缩进 12px，inside 落点还要让开行首两个 24px 按钮，于是被拖行
 * 与落点的横向中心最多差 20px，而相邻落点的纵向间距只有 17px。只要碰撞检测退回成
 * 「二维中心距」，下面的断言就会挂：那正是原始缺陷——连按方向键时高亮停在原地。
 * 树形与几何表是同一棵演示树的两个侧面：几何决定「走到哪」，树决定「哪些落点值得
 * 走」——放下会被判成 CYCLE 的落点不该占用一次按键。
 */
import {
	buildModuleTree,
	type ModuleTreeNode,
} from "@automationstack/api/lib/module-tree";
import type { Active, ClientRect, SensorContext } from "@dnd-kit/core";
import { expect, test } from "vitest";

import { createModuleKeyboardDrag } from "@/components/workspace/module-drag-keyboard";

const CELL_SEPARATOR = /\s+/;
/** 默认拖叶子 c（订单管理，不触发 CYCLE 过滤）；b 有 c、d 两个子模块；a 是根。 */
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

/** 由「父>子,子」空格分隔的规格建树；没被认领的 id 是根。 */
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

/** 实测的 8 模块树：a 是根，b/e/g 挂在 a 下，c/d 挂在 b 下，f 挂在 e 下，h 挂在 g 下。 */
const TREE = makeTree("a>b,e,g b>c,d e>f g>h");

/** 被拖行整行的实测矩形（c 是叶子，b 有子模块，a 是根）。 */
const [, LEAF_ROW] = parseRect("row 193 28 32 216");
const [, PARENT_ROW] = parseRect("row 159 28 20 228");
const [, ROOT_ROW] = parseRect("row 125 28 8 240");

/** 被拖模块自身的两个落点也在表里——它们必须被排除出步进序列。 */
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
	/** true = 按键后不移动碰撞矩形，把游标与几何拉开看。 */ hold?: boolean;
	table?: string;
	tree?: readonly ModuleTreeNode[];
}

/**
 * 复刻 dnd-kit 的键盘循环：KeyboardSensor 拿 collisionRect 的左上角当
 * currentCoordinates，再把坐标器返回的坐标当成新的左上角（core.esm.js 的
 * handleKeyDown / handleMove）。
 */
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

/** 每次按键后的 over.id，第 0 项是拿起瞬间的落座。 */
function walk(code: string, presses: number, options?: DragOptions): string[] {
	const run = driver(options);
	const visited = [run.over()];
	for (const _ of Array.from({ length: presses })) {
		run.press(code);
		visited.push(run.over());
	}
	return visited;
}

/** 断言连按 code 后依次落在 expected（空格分隔、首项是拿起瞬间的落座）上。 */
function expectPath(
	code: string,
	expected: string,
	options?: DragOptions
): string[] {
	const visited = walk(code, expected.split(" ").length - 1, options);
	expect(visited.join(" ")).toBe(expected);
	return visited;
}

/** 相邻重复 = 那一次按键没走动，也就是「空走一步」。 */
function consecutiveRepeats(ids: readonly string[]): string[] {
	return ids.filter((id, index) => index > 0 && id === ids[index - 1]);
}

/** 按满这么多次，任何方向都必然已经顶到序列的一端。 */
const STEPS_PAST_END = 14;
/** 从拿起处向下 / 向上分别能走到的落点数（叶子 c，共 15 个落点）。 */
const REACHABLE_DOWNWARDS = 11;
const REACHABLE_UPWARDS = 5;
/** 上下都走到底之后，这次拖拽总共能走到的落点集合（顺序另有测试管）。 */
function allReachable(options?: DragOptions): Set<string> {
	const down = walk("ArrowDown", STEPS_PAST_END, options);
	const up = walk("ArrowUp", STEPS_PAST_END, options);
	return new Set([...down, ...up]);
}

/** 几何表里除 excluded（空格分隔）之外的全部落点。 */
function without(excluded: string): Set<string> {
	const dropped = excluded.split(" ");
	const ids = [...parseRects(TREE_TABLE).keys()];
	return new Set(ids.filter((id) => !dropped.includes(id)));
}

test("向下每按一次恰好推进一个落点，不重复也不跳过", () => {
	const visited = expectPath(
		"ArrowDown",
		"before:d inside:d before:e inside:e before:f inside:f before:g inside:g before:h inside:h root-end"
	);
	expect(consecutiveRepeats(visited)).toEqual([]);
});

test("向上是向下的镜像，同样不重复不跳过", () => {
	const visited = expectPath(
		"ArrowUp",
		"before:d inside:b before:b inside:a before:a"
	);
	expect(consecutiveRepeats(visited)).toEqual([]);
});

test("走到序列尾部后停住，不回绕也不越界", () => {
	const visited = walk("ArrowDown", STEPS_PAST_END);
	expect(visited.at(-1)).toBe("root-end");
	// 只有撞到尾部才允许重复，且重复的只能是最后一个落点。
	expect(new Set(visited).size).toBe(REACHABLE_DOWNWARDS);
	expect(new Set(consecutiveRepeats(visited))).toEqual(new Set(["root-end"]));
});

test("走到序列头部后停住", () => {
	const visited = walk("ArrowUp", STEPS_PAST_END);
	expect(visited.at(-1)).toBe("before:a");
	expect(new Set(visited).size).toBe(REACHABLE_UPWARDS);
});

test("被拖模块自身的两个落点不出现在序列里，其余全部可达", () => {
	// 叶子模块不触发 CYCLE 过滤：除自身外每个落点都必须还能走到，
	// 既没有多排除（endsWith 的老毛病），也没有跳过任何一个落点。
	expect(allReachable()).toEqual(without("before:c inside:c"));
});

test("排除的是「同一个 moduleId」而不是 id 后缀", () => {
	// 老实现用 `key.endsWith(activeId)`，会把 xb 的两个落点一并排除掉。
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
	// 退化几何：两条插入条量出同一个中心 y（190）。靠几何反推游标只能二选一，
	// 只有「按序列下标推进」才能保证两个都恰好走到一次。
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
	// 目标是 inside:d（top 231、高 20 → 中心 241），被拖行高 28 → top 应为 227。
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
	// b 的子孙是 c、d：这四个落点放下必是 CYCLE，键盘不该逼用户空翻过去。
	expect(allReachable(options)).toEqual(
		without("before:b inside:b before:c inside:c before:d inside:d")
	);
	// 序列本身仍然连续：从 inside:a 一步跨到 before:e，中间不停顿。
	expectPath("ArrowDown", "inside:a before:e inside:e", options);
});

test("拖根模块时只剩下根层级末尾一个落点，且序列不为空", () => {
	const options = { activeId: ROOT_ID, activeRow: ROOT_ROW };
	// 整棵树都是 a 的子孙，唯一放得下的是「移到根层级末尾」（noop 但合法）。
	expectPath("ArrowDown", "root-end root-end root-end", options);
	expect(allReachable(options)).toEqual(new Set(["root-end"]));
});

test("被拖模块不在树里时退回「只排除自身落点」，不会把落点滤空", () => {
	// 树还没刷新完 / 模块刚被别人删掉：resolveModuleDrop 一律返回 noop，
	// 过滤自动失效，键盘用户仍能走遍所有落点，而不是无处可放。
	const options = {
		activeId: PARENT_ID,
		activeRow: PARENT_ROW,
		tree: makeTree("z"),
	};
	expect(allReachable(options)).toEqual(without("before:b inside:b"));
});
