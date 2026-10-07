import type { Context } from "../context";
import type { InvalidateAction, InvalidateEntity } from "../realtime/protocol";
import { publishInvalidate } from "./realtime-publish";

type MindmapOpKind =
	| "createCase"
	| "createModule"
	| "moveCase"
	| "moveModule"
	| "removeCase"
	| "removeModule"
	| "renameCase"
	| "renameModule";

interface InvalidateSpec {
	action: InvalidateAction;
	entity: InvalidateEntity;
}

const OP_INVALIDATE: Record<MindmapOpKind, InvalidateSpec> = {
	createCase: { action: "create", entity: "case" },
	createModule: { action: "create", entity: "module" },
	moveCase: { action: "move", entity: "case" },
	moveModule: { action: "move", entity: "module" },
	removeCase: { action: "delete", entity: "case" },
	removeModule: { action: "delete", entity: "module" },
	renameCase: { action: "update", entity: "case" },
	renameModule: { action: "update", entity: "module" },
};

export interface MindmapInvalidateOp {
	id?: string;
	op: MindmapOpKind;
	tempId?: string;
}

interface MindmapInvalidateGroup {
	action: InvalidateAction;
	entity: InvalidateEntity;
	ids: string[];
}

function resolveOpId(
	op: MindmapInvalidateOp,
	idMap: Record<string, string>
): string | null {
	const raw = op.tempId ?? op.id;
	if (!raw) {
		return null;
	}
	return idMap[raw] ?? raw;
}

export function groupMindmapInvalidations(
	operations: MindmapInvalidateOp[],
	idMap: Record<string, string>
): MindmapInvalidateGroup[] {
	const groups = new Map<string, MindmapInvalidateGroup>();
	for (const op of operations) {
		const spec = OP_INVALIDATE[op.op];
		const id = resolveOpId(op, idMap);
		if (!id) {
			continue;
		}
		const key = `${spec.entity}:${spec.action}`;
		const group = groups.get(key);
		if (group) {
			if (!group.ids.includes(id)) {
				group.ids.push(id);
			}
		} else {
			groups.set(key, { action: spec.action, entity: spec.entity, ids: [id] });
		}
	}
	return [...groups.values()];
}

export interface PublishMindmapOptions {
	context: Context;
	idMap: Record<string, string>;
	operations: MindmapInvalidateOp[];
	projectId: string | null;
}

export function publishMindmapInvalidations(
	options: PublishMindmapOptions
): void {
	const { projectId } = options;
	if (!projectId) {
		return;
	}
	for (const group of groupMindmapInvalidations(
		options.operations,
		options.idMap
	)) {
		publishInvalidate({
			action: group.action,
			context: options.context,
			entity: group.entity,
			ids: group.ids,
			projectId,
		});
	}
}
