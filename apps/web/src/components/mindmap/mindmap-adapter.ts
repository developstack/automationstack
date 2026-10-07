import type {
	CasePriority,
	CaseStatus,
	CaseStep,
} from "@automationstack/db/schema/test-cases";
import type { MindElixirData, NodeObj, TagObj } from "mind-elixir";
import { type MindmapBudgetPlan, planMindmapRender } from "./mindmap-budget.ts";
import { sortByOrder } from "./mindmap-cache-order.ts";
import {
	decodeMindmapNodeId,
	encodeCaseNodeId,
	encodeExpectedNodeId,
	encodeModuleNodeId,
	encodeProjectNodeId,
	encodeStepNodeId,
	isStepNodeRef,
	type MindmapEntityNodeRef,
	type MindmapNodeKind,
	type MindmapNodeRef,
} from "./mindmap-node-id.ts";

export interface MindmapCaseInput {
	id: string;
	moduleId: string;
	name: string;
	priority: CasePriority;
	sortOrder: number;
	status: CaseStatus;
	steps: CaseStep[];
}

export interface MindmapModuleInput {
	children: MindmapModuleInput[];
	id: string;
	name: string;
	sortOrder: number;
}

export interface MindmapTreeInput {
	cases: MindmapCaseInput[];
	modules: MindmapModuleInput[];
	projectId: string;
	projectName: string;
}

export interface MindmapNodeMeta {
	allowChildren: boolean;
	kind: MindmapNodeKind;
}

export type MindmapNode = NodeObj<MindmapNodeMeta>;

export interface MindmapEntityRef {
	id: string;
	kind: "case" | "module";
}

const PRIORITY_TAG_STYLES: Record<
	CasePriority,
	Readonly<Record<string, string>>
> = {
	P0: {
		background: "var(--destructive)",
		color: "var(--destructive-foreground)",
	},
	P1: {
		background: "color-mix(in oklch, var(--destructive) 15%, transparent)",
		color: "var(--destructive)",
	},
	P2: { background: "var(--secondary)", color: "var(--secondary-foreground)" },
	P3: { background: "transparent", color: "var(--muted-foreground)" },
};

export function buildPriorityTag(priority: CasePriority): TagObj {
	return { style: PRIORITY_TAG_STYLES[priority], text: priority };
}

function groupCasesByModule(
	cases: readonly MindmapCaseInput[]
): Map<string, MindmapCaseInput[]> {
	const byModule = new Map<string, MindmapCaseInput[]>();
	for (const caseNode of cases) {
		const bucket = byModule.get(caseNode.moduleId);
		if (bucket === undefined) {
			byModule.set(caseNode.moduleId, [caseNode]);
		} else {
			bucket.push(caseNode);
		}
	}
	for (const [moduleId, bucket] of byModule) {
		byModule.set(moduleId, sortByOrder(bucket));
	}
	return byModule;
}

const EXPECTED_TOPIC_PREFIX = "预期：";

function toExpectedNode(caseId: string, step: CaseStep): MindmapNode {
	return {
		id: encodeExpectedNodeId(caseId, step.id),
		metadata: { allowChildren: false, kind: "expected" },
		topic: `${EXPECTED_TOPIC_PREFIX}${step.expected.trim()}`,
	};
}

function toStepNode(
	caseId: string,
	step: CaseStep,
	position: number
): MindmapNode {
	const node: MindmapNode = {
		id: encodeStepNodeId(caseId, step.id),
		metadata: { allowChildren: false, kind: "step" },
		topic: `${position}. ${step.step}`,
	};
	return step.expected.trim().length === 0
		? node
		: { ...node, children: [toExpectedNode(caseId, step)], expanded: true };
}

function toCaseNode(caseInput: MindmapCaseInput): MindmapNode {
	const node: MindmapNode = {
		id: encodeCaseNodeId(caseInput.id),
		metadata: { allowChildren: false, kind: "case" },
		tags: [buildPriorityTag(caseInput.priority)],
		topic: caseInput.name,
	};
	const steps = caseInput.steps.map((step, index) =>
		toStepNode(caseInput.id, step, index + 1)
	);
	return steps.length === 0
		? node
		: { ...node, children: steps, expanded: false };
}

interface ModuleContext {
	casesByModule: ReadonlyMap<string, MindmapCaseInput[]>;
	expandedModuleIds: ReadonlySet<string>;
}

function toModuleNode(
	module: MindmapModuleInput,
	context: ModuleContext
): MindmapNode {
	const childModules = sortByOrder(module.children).map((child) =>
		toModuleNode(child, context)
	);
	const caseChildren = (context.casesByModule.get(module.id) ?? []).map(
		toCaseNode
	);
	return {
		children: [...childModules, ...caseChildren],
		expanded: context.expandedModuleIds.has(module.id),
		id: encodeModuleNodeId(module.id),
		metadata: { allowChildren: true, kind: "module" },
		topic: module.name,
	};
}

export function toMindElixirData(
	input: MindmapTreeInput,
	plan: MindmapBudgetPlan = planMindmapRender(input)
): MindElixirData {
	const context: ModuleContext = {
		casesByModule: groupCasesByModule(input.cases),
		expandedModuleIds: plan.expandedModuleIds,
	};
	const nodeData: MindmapNode = {
		children: sortByOrder(input.modules).map((module) =>
			toModuleNode(module, context)
		),
		expanded: true,
		id: encodeProjectNodeId(input.projectId),
		metadata: { allowChildren: true, kind: "project" },
		topic: input.projectName,
	};
	return { nodeData };
}

export function getMindmapNodeRef(
	node: Pick<NodeObj, "id">
): MindmapNodeRef | null {
	return decodeMindmapNodeId(node.id);
}

export function getContainerNodeRef(
	node: Pick<NodeObj, "id">
): MindmapEntityNodeRef | null {
	const ref = decodeMindmapNodeId(node.id);
	return ref === null || isStepNodeRef(ref) ? null : ref;
}

export function getEntityNodeRef(
	node: Pick<NodeObj, "id">
): MindmapEntityRef | null {
	const ref = decodeMindmapNodeId(node.id);
	if (ref === null || isStepNodeRef(ref) || ref.kind === "project") {
		return null;
	}
	return { id: ref.id, kind: ref.kind };
}

export function canHaveChildren(node: Pick<NodeObj, "id">): boolean {
	const kind = decodeMindmapNodeId(node.id)?.kind;
	return kind === "module" || kind === "project";
}
