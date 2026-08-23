/**
 * Mindmap node id scheme shared by the adapter, the canvas and the guards:
 * - project root:  `p:<projectId>`
 * - module node:   `m:<moduleId>`
 * - case node:     `c:<caseId>`
 * - step node:     `s:<caseId>:<stepId>`
 * - expected node: `x:<caseId>:<stepId>`
 *
 * Step and expected nodes are read-only on the canvas (they live inside the
 * case's `steps` jsonb, which `mindmap.batch` has no operation for), but they
 * still have to be modelled explicitly: every guard decides what to allow from
 * the decoded kind, and an id that decodes to `null` would be treated as
 * "unknown, therefore permissive" — which is how a module could end up being
 * dropped into a step.
 *
 * Step ids are composite because a step id is only unique inside its case; the
 * canvas needs globally unique node ids.
 */
export type MindmapEntityNodeKind = "case" | "module" | "project";

/** Kinds rendered from a case's `steps` array; never editable on the canvas. */
export type MindmapStepNodeKind = "expected" | "step";

export type MindmapNodeKind = MindmapEntityNodeKind | MindmapStepNodeKind;

export interface MindmapEntityNodeRef {
	/** Raw entity id (uuid) without the kind prefix. */
	id: string;
	kind: MindmapEntityNodeKind;
}

export interface MindmapStepNodeRef {
	/** Owning case id: the step itself is not addressable on its own. */
	caseId: string;
	kind: MindmapStepNodeKind;
	/** `CaseStep.id`, unique within the case only. */
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

/** True for the two kinds that mirror a `CaseStep`; narrows the ref union. */
export function isStepNodeRef(ref: MindmapNodeRef): ref is MindmapStepNodeRef {
	return ref.kind === "step" || ref.kind === "expected";
}

/** `<caseId>:<stepId>`; both halves must be non-empty. */
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

/**
 * Decodes a mindmap node id into its kind + raw entity ids.
 * Returns null for unknown prefixes or a malformed payload.
 */
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
