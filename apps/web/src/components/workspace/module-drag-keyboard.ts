/**
 * 键盘拖拽的落点游标：坐标推进器 + 键盘专用碰撞检测。
 *
 * dnd-kit 默认的键盘坐标器每次方向键固定平移 25px，落点靠 closestCenter 猜；
 * 模块树里「插入位置」的落点条只有 6px 高，默认步进会在「插到某行之前」与
 * 「挂到某行之下」之间来回跳，键盘用户根本无法确定地完成一次重排。
 *
 * 只把被拖行的中心对齐到目标落点的中心仍然不够：closestCenter 算的是**二维**
 * 中心距，而模块树的落点横向中心各不相同（每层缩进 12px，inside 落点还要让开
 * 行首两个 24px 按钮）。实测被拖行与 inside 落点的横向中心最多差 20px，
 * 而相邻落点的纵向间距只有 17px —— 于是「对齐到 A 的中心」经常被判成 B，
 * 表现为连按方向键时高亮停在原地（空走一步），偶尔还会越过一个落点。
 *
 * 因此这里不再让碰撞检测去猜：键盘拖拽自己维护一个落点游标，
 * 坐标推进器按序列下标推进游标，碰撞检测直接汇报游标所在的落点。
 * 两者共用同一份 `sortedZones`，「高亮的落点」与「推进到的落点」由构造保证一致，
 * 落点等高、同 y 等退化情况也不会出现跳过或原地踏步。
 *
 * 序列里排除了被拖模块自身的两个落点（落到自己身上恒为 noop，播报出来也是
 * 「挂到「自己」之下」这类无意义文案），所以拿起时游标会落在最近的一个有效落点上，
 * 播报会立刻念出它，用户按 Esc 仍可原样取消。
 *
 * 序列同样排除了「放下必定失败」的落点：拖一个有子模块的节点时，它自己的子孙
 * 落点会被 resolveModuleDrop 判成 CYCLE（放下只弹一条错误 toast）。鼠标用户
 * 直接把指针放到想去的地方，永远不会路过它们；键盘用户却只能逐个空翻过去——
 * 拖根模块时要翻十几个——所以这是键盘专属的可达性缺陷，只能在步进序列里治。
 */
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

/**
 * 落点放下之后是否会产生合法结果——只有这样的落点才进步进序列。
 *
 * 两条排除规则：
 * 1. 被拖模块自身的两个落点。用 parseDropId 精确比对 moduleId，而不是
 *    `id.endsWith(activeId)`：后者是子串匹配，一旦某个 id 是另一个的后缀
 *    就会多排除落点。注意这条不能靠 resolveModuleDrop 代劳——它把落到自己
 *    身上判为 noop（合法），而不是 invalid。
 * 2. resolveModuleDrop 判为 invalid（即 CYCLE）的落点：拖进自己的子孙。
 *
 * 「合法但无变化」的 noop 落点保留（例如把模块挂回它当前的父节点）：
 * 播报说得清楚，放下也不会报错，属于正常可选项而不是死路。
 *
 * tree 里查不到 activeId 时（树还没加载 / 刚被别人删掉），resolveModuleDrop
 * 一律返回 noop，此规则自动失效，行为退回成「只排除自身落点」，不会误杀落点。
 */
function isReachableZone(
	tree: readonly ModuleTreeNode[],
	activeId: string,
	dropId: string
): boolean {
	const drop = parseDropId(dropId);
	// 解析不出来的 id 落下时会被 onDragEnd 直接丢弃，是条死路，不该占一步。
	if (drop === null || drop.moduleId === activeId) {
		return false;
	}
	return resolveModuleDrop(tree, activeId, drop).kind !== "invalid";
}

/**
 * 所有已测量落点按纵向位置排序，排除放下不会有合法结果的那些。
 * sort 是稳定的，同 y 的落点保持注册顺序（即文档顺序），
 * 保证推进器与碰撞检测看到的序列完全一致。
 */
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

/** 距离 y 最近的落点下标；并列时取序列中靠前的那个。空序列返回 -1。 */
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

/** 方向键 → 纵向步进；其他键不接管。 */
function directionOf(code: string): number {
	if (code === ARROW_DOWN) {
		return 1;
	}
	return code === ARROW_UP ? -1 : 0;
}

export interface ModuleKeyboardDrag {
	/** 仅供键盘拖拽使用；指针拖拽仍走 pointerWithin / closestCenter。 */
	collisionDetection: CollisionDetection;
	coordinateGetter: KeyboardCoordinateGetter;
	/** 每次拖拽开始/结束时清空游标，避免上一次拖拽的落点残留。 */
	reset: () => void;
}

/** 「这次键盘拖拽走到哪了」——推进器与碰撞检测共用的同一份可变游标。 */
interface Cursor {
	id: string | null;
}

type TreeGetter = () => readonly ModuleTreeNode[];

/** 游标还在当前序列里就用它，否则按几何位置就近落座（拿起后的第一次）。 */
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
		// 单一出口：biome 会删掉 `return undefined`，而 eslint 的 consistent-return
		// 又不允许「有时返回值、有时空返回」，因此用一个可选结果变量收口。
		let next: ReturnType<KeyboardCoordinateGetter> | undefined;
		const step = directionOf(event.code);
		const { collisionRect, droppableRects } = context;
		if (step !== 0 && collisionRect !== null) {
			// 拖拽中要吃掉方向键，否则页面会跟着滚动。
			event.preventDefault();
			const current = centerY(collisionRect);
			const zones = sortedZones(droppableRects, String(active), getTree());
			// 到达首/尾时 target 为 undefined：游标原地不动，也不再改坐标。
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

/**
 * 造一份带落点游标的键盘拖拽逻辑。
 * 游标是「这次键盘拖拽走到哪了」的唯一事实来源，不从像素反推，
 * 因此不会出现推进器与高亮各说各话。
 *
 * 树是用 getter 拿的，不是当参数直接传：每次 modules.tree 查询刷新都会产生
 * 新的树引用，而游标必须跨按键存活；工厂只能建一次，所以只能在调用时读最新值。
 */
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
