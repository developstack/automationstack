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

/** 缓存根标识：与 `orpc.<router>.key()` 一一对应。 */
export type InvalidateTarget =
	| "caseAttachments"
	| "cases"
	| "mindmap"
	| "modules"
	| "projects"
	| "testRunAttachments"
	| "testRuns";

/** 重连补漏用：断线期间错过的事件无法回放，直接全量刷新。 */
export const ALL_INVALIDATE_TARGETS: readonly InvalidateTarget[] = [
	"caseAttachments",
	"cases",
	"mindmap",
	"modules",
	"projects",
	"testRunAttachments",
	"testRuns",
];

/**
 * 每种实体固定要刷新的缓存根。
 * 脑图（`mindmap.tree`）同时呈现模块树、用例节点与项目根节点 topic，
 * 因此三类实体的变更都要带上 `mindmap`——否则停在脑图页的成员
 * 看不到别人在列表视图做的任何改动。
 */
const ENTITY_TARGETS: Record<InvalidateEntity, readonly InvalidateTarget[]> = {
	/**
	 * 用例本身影响用例查询与脑图；影响模块的动作见下方补充规则。
	 *
	 * 必须额外带上 `caseAttachments`，理由与下面 `testRun` 那条同构：
	 * 正文里的贴图（`![](attachment:<id>)`）要靠 `caseAttachments.list` 换成
	 * **15 分钟**的签名 GET URL，而那个 router 不在 `orpc.cases.key()` 的前缀里
	 * （`key()` 是前缀匹配，只覆盖同一个 router 下的查询）。
	 *
	 * 两件事都要它：
	 * - 别人保存了带新图的正文时发的是 `entity: "case"`，附件列表不跟着刷，
	 *   新贴的图在这边就是一张查不到 URL 的占位（`caseAttachments.list` 的
	 *   缓存契约里明写了这条要求）；
	 * - 签名 15 分钟就过期，一直开着页面看同一条用例的人需要一个重新签名的时机，
	 *   而任何一次用例变更都是天然的时机。
	 */
	case: ["caseAttachments", "cases", "mindmap"],
	/** 模块增删改移都会改变模块树，并改变「某模块下的用例列表」结果。 */
	module: ["cases", "mindmap", "modules"],
	/** 项目元信息影响项目查询，改名同时会改脑图根节点 topic。 */
	project: ["mindmap", "projects"],
	/**
	 * 测试任务的列表、详情、报告全部挂在 `orpc.testRuns` 之下，一个缓存根即可——
	 * `key()` 是前缀匹配，覆盖该 router 下的所有查询。
	 *
	 * 附件必须额外带上 `testRunAttachments`：附件的 `register` / `remove`
	 * 走的也是 `entity: "testRun"` 的失效事件（plan §6.4 刻意不给附件单开 topic），
	 * 但附件列表住在**另一个 router**（`orpc.testRunAttachments.list`），
	 * 不在 `orpc.testRuns.key()` 的前缀里。少了这一项，别人传的截图
	 * 要等本端手动刷新页面才看得到。
	 *
	 * 代价是同页其他用例行的附件查询也一并被标脏，但 TanStack Query 只会重取
	 * **挂载中**的查询，而执行台一次只挂一条用例行的附件列表——正是要刷的那条。
	 *
	 * 注意：测试任务详情页里「用例内容被别人改了」这条链路不依赖本项——
	 * `test_run_cases` 只存 `caseId`，详情页实时 join `test_cases`，
	 * 走的是 `case` 的失效事件（plan §4.2）。
	 */
	testRun: ["testRunAttachments", "testRuns"],
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
