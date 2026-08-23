import { z } from "zod";

/**
 * WS 实时协作协议（plan §5）。
 *
 * 所有消息均为 JSON 文本帧，用 `type` 字段做判别联合：
 * - C→S: presence:update / ping
 * - S→C: presence:sync|join|update|leave / data:invalidate / pong
 *
 * server（apps/server/realtime）与 web（apps/web/src/realtime）通过
 * `@automationstack/api/realtime/protocol` 共用本文件。
 */

/** 无鉴权身份通道：clientId 每 Tab 唯一，name 用户自报。 */
export const realtimeActorSchema = z.object({
	clientId: z.string().min(1),
	name: z.string().min(1),
});

/**
 * 单个在线成员的完整 presence 状态（server rooms 持有并广播）。
 *
 * 打开的用例分两个字段而不是一个带模式的字段：`viewingCaseId` 是「人在这条用例上」，
 * `editingCaseId` 是「这条用例可能被改写」。列表里两者的含义天差地别——前者只是
 * 提示别人也在看，后者是保存会撞 409 的预警，合成一个字段就没法只对后者告警。
 * 编辑中的成员两个字段同时指向同一条用例：`editingCaseId` 不为空并不意味着人不在看它。
 */
export const presenceEntrySchema = z.object({
	clientId: z.string().min(1),
	color: z.string().min(1),
	editingCaseId: z.string().nullable(),
	joinedAt: z.number().int().nonnegative(),
	name: z.string().min(1),
	page: z.string().nullable(),
	view: z.string().min(1),
	viewingCaseId: z.string().nullable(),
});

/**
 * C→S presence 部分补丁；server 合并后以完整 entry 重新广播。
 *
 * `name` / `color` 被排除在外：身份在 WS 握手时由会话 cookie 定死
 * （见 apps/server/src/realtime/ws.ts），客户端改不了自己的显示名，
 * 否则任何人都能顶着别人的用户名出现在协作头像里。
 */
export const presencePatchSchema = presenceEntrySchema
	.omit({ clientId: true, color: true, joinedAt: true, name: true })
	.partial();

export const invalidateEntitySchema = z.enum(["case", "module", "project"]);

export const invalidateActionSchema = z.enum([
	"create",
	"delete",
	"move",
	"restore",
	"update",
]);

/**
 * 数据失效事件：API mutation 成功后经 RealtimeBus 发布，
 * WS 服务端包装成 `data:invalidate` 消息 fan-out 给同项目客户端。
 * actor 为触发者（客户端据此跳过自己触发的失效）。
 */
export const invalidateEventSchema = z.object({
	action: invalidateActionSchema,
	actor: realtimeActorSchema,
	entity: invalidateEntitySchema,
	ids: z.array(z.string()),
	moduleId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// C→S 消息
// ---------------------------------------------------------------------------

export const clientPresenceUpdateSchema = z.object({
	patch: presencePatchSchema,
	type: z.literal("presence:update"),
});

export const clientPingSchema = z.object({
	type: z.literal("ping"),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
	clientPingSchema,
	clientPresenceUpdateSchema,
]);

// ---------------------------------------------------------------------------
// S→C 消息
// ---------------------------------------------------------------------------

/** 加入房间后一次性同步全量在线列表。 */
export const serverPresenceSyncSchema = z.object({
	entries: z.array(presenceEntrySchema),
	type: z.literal("presence:sync"),
});

export const serverPresenceJoinSchema = z.object({
	entry: presenceEntrySchema,
	type: z.literal("presence:join"),
});

/** server 已将 patch 合并进 entry，广播合并后的完整状态。 */
export const serverPresenceUpdateSchema = z.object({
	entry: presenceEntrySchema,
	type: z.literal("presence:update"),
});

export const serverPresenceLeaveSchema = z.object({
	clientId: z.string().min(1),
	type: z.literal("presence:leave"),
});

export const serverInvalidateSchema = invalidateEventSchema.extend({
	type: z.literal("data:invalidate"),
});

export const serverPongSchema = z.object({
	type: z.literal("pong"),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
	serverInvalidateSchema,
	serverPongSchema,
	serverPresenceJoinSchema,
	serverPresenceLeaveSchema,
	serverPresenceSyncSchema,
	serverPresenceUpdateSchema,
]);

// ---------------------------------------------------------------------------
// 推导类型
// ---------------------------------------------------------------------------

export type RealtimeActor = z.infer<typeof realtimeActorSchema>;
export type PresenceEntry = z.infer<typeof presenceEntrySchema>;
export type PresencePatch = z.infer<typeof presencePatchSchema>;
export type InvalidateEntity = z.infer<typeof invalidateEntitySchema>;
export type InvalidateAction = z.infer<typeof invalidateActionSchema>;
export type InvalidateEvent = z.infer<typeof invalidateEventSchema>;

export type ClientPresenceUpdateMessage = z.infer<
	typeof clientPresenceUpdateSchema
>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerInvalidateMessage = z.infer<typeof serverInvalidateSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
