import type { Context } from "../context";
import { realtimeBus } from "../realtime/bus";
import type {
	InvalidateAction,
	InvalidateEntity,
	RealtimeActor,
} from "../realtime/protocol";

const SYSTEM_ACTOR: RealtimeActor = { clientId: "system", name: "系统" };

export interface PublishInvalidateOptions {
	action: InvalidateAction;
	context: Context;
	entity: InvalidateEntity;
	ids: string[];
	moduleId?: string;
	projectId: string;
}

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

export function publishMembershipRevoked(
	projectId: string,
	userId: string
): void {
	realtimeBus.publishMembershipRevoked(projectId, userId);
}
