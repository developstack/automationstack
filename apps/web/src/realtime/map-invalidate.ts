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
	| "projectStats"
	| "testRunAttachments"
	| "testRuns";

export const ALL_INVALIDATE_TARGETS: readonly InvalidateTarget[] = [
	"caseAttachments",
	"cases",
	"mindmap",
	"modules",
	"projects",
	"projectStats",
	"testRunAttachments",
	"testRuns",
];

// 项目概览的统计来自用例和测试任务，所以用例、模块（删除模块时删除其中的用例）和测试任务改变时都刷新
const ENTITY_TARGETS: Record<InvalidateEntity, readonly InvalidateTarget[]> = {
	case: ["caseAttachments", "cases", "mindmap", "projectStats"],
	module: ["cases", "mindmap", "modules", "projectStats"],
	project: ["mindmap", "projects"],
	testRun: ["projectStats", "testRunAttachments", "testRuns"],
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
