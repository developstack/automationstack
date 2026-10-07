import { z } from "zod";

export const realtimeActorSchema = z.object({
	clientId: z.string().min(1),
	name: z.string().min(1),
});

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

export const presencePatchSchema = presenceEntrySchema
	.omit({ clientId: true, color: true, joinedAt: true, name: true })
	.partial();

export const invalidateEntitySchema = z.enum([
	"case",
	"module",
	"project",
	"testRun",
]);

export const invalidateActionSchema = z.enum([
	"create",
	"delete",
	"move",
	"restore",
	"update",
]);

export const invalidateEventSchema = z.object({
	action: invalidateActionSchema,
	actor: realtimeActorSchema,
	entity: invalidateEntitySchema,
	ids: z.array(z.string()),
	moduleId: z.string().optional(),
});

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

export const serverPresenceSyncSchema = z.object({
	entries: z.array(presenceEntrySchema),
	type: z.literal("presence:sync"),
});

export const serverPresenceJoinSchema = z.object({
	entry: presenceEntrySchema,
	type: z.literal("presence:join"),
});

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
