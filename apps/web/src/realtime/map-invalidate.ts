import type {
	InvalidateAction,
	InvalidateEntity,
	InvalidateEvent,
} from "@automationstack/api/realtime/protocol";

export type InvalidateTarget =
	| "caseAttachments"
	| "cases"
	| "mindmap"
	| "modules"
	| "projects"
	| "testRunAttachments"
	| "testRuns";

export const ALL_INVALIDATE_TARGETS: readonly InvalidateTarget[] = [
	"caseAttachments",
	"cases",
	"mindmap",
	"modules",
	"projects",
	"testRunAttachments",
	"testRuns",
];

const ENTITY_TARGETS: Record<InvalidateEntity, readonly InvalidateTarget[]> = {
	case: ["caseAttachments", "cases", "mindmap"],
	module: ["cases", "mindmap", "modules"],
	project: ["mindmap", "projects"],
	testRun: ["testRunAttachments", "testRuns"],
};

const CASE_ACTIONS_TOUCHING_MODULES: readonly InvalidateAction[] = [
	"create",
	"delete",
	"move",
	"restore",
];

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

export function shouldApplyInvalidate(
	event: InvalidateEvent,
	selfClientId: string | null
): boolean {
	return selfClientId === null || event.actor.clientId !== selfClientId;
}
