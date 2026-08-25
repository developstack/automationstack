import type { Context } from "../context";
import { realtimeBus } from "../realtime/bus";
import type {
	InvalidateAction,
	InvalidateEntity,
	RealtimeActor,
} from "../realtime/protocol";

/**
 * 无 actor（MCP / 脚本 / 未带身份头的调用）时的占位触发者。
 * 其 clientId 不会与任何真实客户端（每 Tab 一个 uuid）相同，
 * 因此所有在线客户端都不会把该事件当成「自己触发的」而跳过刷新。
 */
const SYSTEM_ACTOR: RealtimeActor = { clientId: "system", name: "系统" };

export interface PublishInvalidateOptions {
	action: InvalidateAction;
	context: Context;
	entity: InvalidateEntity;
	ids: string[];
	moduleId?: string;
	projectId: string;
}

/**
 * mutation 成功（事务已提交）后发布数据失效事件。
 * WS 服务端订阅总线并 fan-out 给同 projectId 房间的客户端。
 *
 * **v1 已知边界（已接受，勿按 bug 处理）**：实时是「按 projectId 分房间」的，
 * 事件只到达已进入该项目房间的客户端。因此 `projects.create` 的事件发往
 * 新项目自己的房间时无人在场，项目列表页做不到跨端自动刷新；
 * `projects.remove/update` 同理只有正在该项目内的人能收到。
 * 要覆盖项目列表页需要引入「全局房间」（客户端进站即加入），
 * 属于架构改动，不在本期范围。
 */
export function publishInvalidate(options: PublishInvalidateOptions): void {
	publishInvalidateAs({
		action: options.action,
		actor: options.context.actor ?? SYSTEM_ACTOR,
		entity: options.entity,
		ids: options.ids,
		moduleId: options.moduleId,
		projectId: options.projectId,
	});
}

export interface PublishInvalidateAsOptions {
	action: InvalidateAction;
	actor: RealtimeActor;
	entity: InvalidateEntity;
	ids: string[];
	moduleId?: string;
	projectId: string;
}

/**
 * 同一件事，但**自带 actor**：给没有 oRPC `Context` 的裸 HTTP 端点用
 * （ingest 上报、Jira webhook 这类外部无会话请求）。
 *
 * 为什么不让那些端点自己 `realtimeBus.publish`：事件的形状（哪些字段、
 * ids 为空时不发）只该有一处定义。为什么不让它们伪造一个 `Context`：
 * `Context` 还挂着 `cookies` / `secure` 这些只对会话有意义的字段，
 * 造一个假的等于让「这是不是一次会话请求」这件事在类型上不再可信。
 */
export function publishInvalidateAs(options: PublishInvalidateAsOptions): void {
	if (options.ids.length === 0) {
		return;
	}
	realtimeBus.publish(options.projectId, {
		action: options.action,
		actor: options.actor,
		entity: options.entity,
		ids: options.ids,
		moduleId: options.moduleId,
	});
}
