/**
 * 模块树展开状态的纯逻辑层：默认展开到二级 + 用户覆盖 + 深链祖先链。
 *
 * 为什么要默认折叠：侧边栏每个模块要付约 24 个 DOM 元素 / 1.2ms 主线程
 * （T15 压测；本仓库实测 410 个模块 = 10025 个 `aside` 后代元素、493ms long task）。
 * 模块数一多，最先撞墙的是这棵树而不是脑图画布。
 *
 * 为什么不上虚拟化：模块树的落点（dnd-kit droppable）矩形要进 `droppableRects`
 * 才能被 module-drag-keyboard.ts 的步进序列看见，视口外的行被回收会让键盘拖拽
 * 的落点凭空消失；而「折叠」本来就意味着那些落点对鼠标用户也不可见，语义自洽。
 *
 * 展开状态 = 「默认规则」+「用户覆盖」两层：
 * - 默认规则：深度小于 DEFAULT_OPEN_DEPTH 的节点展开（即根层展开、二级起折叠），
 *   小树整棵展开，URL 选中模块的祖先链展开；
 * - 用户覆盖：用户手动点过的节点以覆盖为准，且覆盖存活于 modules.tree 的每次
 *   刷新（覆盖表不随树重建）与页面刷新（会话存储，见 use-module-expansion.ts）。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";

/**
 * 默认展开的深度层数：1 = 只展开根层，于是「根 + 一级子模块」可见（二级树）。
 * 根节点 depth 为 0。
 */
export const DEFAULT_OPEN_DEPTH = 1;

/**
 * 模块总数不超过这个值时整棵树默认展开。
 *
 * 依据（本仓库 A/B 实测，见 T30 报告）：410 个模块全展开 = 10025 个 `aside`
 * 后代元素，折叠到二级后 50 个可见 = 1225 个，反推每个模块 24.4 个 DOM 元素、
 * 约 1.0–1.2ms 主线程时间。40 个模块 ≈ 976 个元素 ≈ 41–48ms，正好压在浏览器
 * 判定 long task 的 50ms 阈值之下；再多就可能把首屏推成一次长任务。
 * 演示种子项目只有 8 个模块，属于「小项目全展开」这一侧。
 */
export const FULL_EXPAND_MAX_MODULES = 40;

/** 用户手动展开/折叠过的节点：id → 是否展开。没有条目 = 用默认规则。 */
export type ModuleOpenOverrides = ReadonlyMap<string, boolean>;

export interface ModuleOpenContext {
	/** URL 选中模块的祖先链，必须展开，否则深链打不开。 */
	ancestorIds: ReadonlySet<string>;
	overrides: ModuleOpenOverrides;
	totalModules: number;
}

/** 整棵树的模块总数（含各层子模块）。 */
export function countModules(nodes: readonly ModuleTreeNode[]): number {
	let total = 0;
	for (const node of nodes) {
		total += 1 + countModules(node.children);
	}
	return total;
}

/**
 * 从根到 `moduleId` 的祖先 id（不含它自己）。
 * 找不到（树还没刷新到 / 模块已被删）时返回空数组，调用方按「没有祖先」处理。
 */
export function findModuleAncestorIds(
	nodes: readonly ModuleTreeNode[],
	moduleId: string | undefined
): string[] {
	if (moduleId === undefined) {
		return [];
	}
	const path: string[] = [];
	const walk = (list: readonly ModuleTreeNode[]): boolean => {
		for (const node of list) {
			if (node.id === moduleId) {
				return true;
			}
			path.push(node.id);
			if (walk(node.children)) {
				return true;
			}
			path.pop();
		}
		return false;
	};
	return walk(nodes) ? path : [];
}

/** 某个节点此刻是否展开：用户覆盖优先，其次才是默认规则。 */
export function isModuleOpen(
	context: ModuleOpenContext,
	moduleId: string,
	depth: number
): boolean {
	const override = context.overrides.get(moduleId);
	if (override !== undefined) {
		return override;
	}
	return (
		context.totalModules <= FULL_EXPAND_MAX_MODULES ||
		depth < DEFAULT_OPEN_DEPTH ||
		context.ancestorIds.has(moduleId)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 覆盖表 → 会话存储用的 JSON 文本。 */
export function serializeModuleOverrides(
	overrides: ModuleOpenOverrides
): string {
	return JSON.stringify(Object.fromEntries(overrides));
}

/**
 * 会话存储里的 JSON 文本 → 覆盖表。
 * 存储内容是用户可改的外部输入，任何形状不对的值都直接忽略，
 * 坏数据只该让展开状态回到默认，不该让整棵树炸掉。
 */
export function parseModuleOverrides(raw: string | null): Map<string, boolean> {
	const overrides = new Map<string, boolean>();
	if (raw === null || raw === "") {
		return overrides;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return overrides;
	}
	if (!isRecord(parsed)) {
		return overrides;
	}
	for (const [id, open] of Object.entries(parsed)) {
		if (typeof open === "boolean") {
			overrides.set(id, open);
		}
	}
	return overrides;
}
