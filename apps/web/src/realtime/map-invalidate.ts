/**
 * `data:invalidate` → TanStack Query 缓存根的映射规则（plan §5）。
 *
 * 本文件保持纯函数、不依赖 React / orpc / DOM，方便单测；
 * 由 `realtime-invalidate.ts` 负责把 target 翻译成 `orpc.<router>.key()`。
 */
import type {
	InvalidateAction,
	InvalidateEntity,
	InvalidateEvent,
} from "@automationstack/api/realtime/protocol";

/** 缓存根标识：与 `orpc.cases/mindmap/modules/projects.key()` 一一对应。 */
export type InvalidateTarget = "cases" | "mindmap" | "modules" | "projects";

/** 重连补漏用：断线期间错过的事件无法回放，直接全量刷新。 */
export const ALL_INVALIDATE_TARGETS: readonly InvalidateTarget[] = [
	"cases",
	"mindmap",
	"modules",
	"projects",
];

/**
 * 每种实体固定要刷新的缓存根。
 * 脑图（`mindmap.tree`）同时呈现模块树、用例节点与项目根节点 topic，
 * 因此三类实体的变更都要带上 `mindmap`——否则停在脑图页的成员
 * 看不到别人在列表视图做的任何改动。
 */
const ENTITY_TARGETS: Record<InvalidateEntity, readonly InvalidateTarget[]> = {
	/** 用例本身只影响用例查询与脑图；影响模块的动作见下方补充规则。 */
	case: ["cases", "mindmap"],
	/** 模块增删改移都会改变模块树，并改变「某模块下的用例列表」结果。 */
	module: ["cases", "mindmap", "modules"],
	/** 项目元信息影响项目查询，改名同时会改脑图根节点 topic。 */
	project: ["mindmap", "projects"],
};

/** 这些用例动作会改变模块归属/统计，需要连带刷新模块树。 */
const CASE_ACTIONS_TOUCHING_MODULES: readonly InvalidateAction[] = [
	"create",
	"delete",
	"move",
	"restore",
];

/** 事件 → 需要 invalidate 的缓存根列表（已去重）。 */
export function mapInvalidateTargets(
	event: InvalidateEvent
): InvalidateTarget[] {
	const targets = new Set<InvalidateTarget>(ENTITY_TARGETS[event.entity]);
	if (
		event.entity === "case" &&
		CASE_ACTIONS_TOUCHING_MODULES.includes(event.action)
	) {
		targets.add("modules");
	}
	return [...targets];
}

/**
 * 自己触发的失效直接跳过：本端 mutation 的 `onSuccess` 已经刷过一次，
 * 再刷会产生多余请求。actor 由 oRPC 的 `x-client-id` 头带到服务端；
 * 身份未就绪（selfClientId 为 null）时保守地全部应用。
 */
export function shouldApplyInvalidate(
	event: InvalidateEvent,
	selfClientId: string | null
): boolean {
	return selfClientId === null || event.actor.clientId !== selfClientId;
}
