export type MindmapEntityNodeKind = "case" | "module" | "project";

export type MindmapStepNodeKind = "expected" | "step";

export type MindmapNodeKind = MindmapEntityNodeKind | MindmapStepNodeKind;

export interface MindmapEntityNodeRef {
	id: string;
	kind: MindmapEntityNodeKind;
}

export interface MindmapStepNodeRef {
	caseId: string;
	kind: MindmapStepNodeKind;
	stepId: string;
}

export type MindmapNodeRef = MindmapEntityNodeRef | MindmapStepNodeRef;

const CASE_NODE_PREFIX = "c:";
const EXPECTED_NODE_PREFIX = "x:";
const MODULE_NODE_PREFIX = "m:";
const PROJECT_NODE_PREFIX = "p:";
const STEP_NODE_PREFIX = "s:";
const ID_SEPARATOR = ":";

const PREFIX_TO_KIND: readonly (readonly [string, MindmapNodeKind])[] = [
	[CASE_NODE_PREFIX, "case"],
	[EXPECTED_NODE_PREFIX, "expected"],
	[MODULE_NODE_PREFIX, "module"],
	[PROJECT_NODE_PREFIX, "project"],
	[STEP_NODE_PREFIX, "step"],
];

export function encodeProjectNodeId(projectId: string): string {
	return `${PROJECT_NODE_PREFIX}${projectId}`;
}

export function encodeModuleNodeId(moduleId: string): string {
	return `${MODULE_NODE_PREFIX}${moduleId}`;
}

export function encodeCaseNodeId(caseId: string): string {
	return `${CASE_NODE_PREFIX}${caseId}`;
}

export function encodeStepNodeId(caseId: string, stepId: string): string {
	return `${STEP_NODE_PREFIX}${caseId}${ID_SEPARATOR}${stepId}`;
}

export function encodeExpectedNodeId(caseId: string, stepId: string): string {
	return `${EXPECTED_NODE_PREFIX}${caseId}${ID_SEPARATOR}${stepId}`;
}

export function isStepNodeRef(ref: MindmapNodeRef): ref is MindmapStepNodeRef {
	return ref.kind === "step" || ref.kind === "expected";
}

function decodeStepPayload(
	payload: string,
	kind: MindmapStepNodeKind
): MindmapStepNodeRef | null {
	const separator = payload.indexOf(ID_SEPARATOR);
	if (separator <= 0) {
		return null;
	}
	const stepId = payload.slice(separator + 1);
	return stepId.length > 0
		? { caseId: payload.slice(0, separator), kind, stepId }
		: null;
}

export function decodeMindmapNodeId(nodeId: string): MindmapNodeRef | null {
	for (const [prefix, kind] of PREFIX_TO_KIND) {
		if (nodeId.startsWith(prefix)) {
			const payload = nodeId.slice(prefix.length);
			if (kind === "step" || kind === "expected") {
				return decodeStepPayload(payload, kind);
			}
			return payload.length > 0 ? { id: payload, kind } : null;
		}
	}
	return null;
}

export function isProjectNodeId(nodeId: string): boolean {
	return decodeMindmapNodeId(nodeId)?.kind === "project";
}

export function isModuleNodeId(nodeId: string): boolean {
	return decodeMindmapNodeId(nodeId)?.kind === "module";
}

export function isCaseNodeId(nodeId: string): boolean {
	return decodeMindmapNodeId(nodeId)?.kind === "case";
}
