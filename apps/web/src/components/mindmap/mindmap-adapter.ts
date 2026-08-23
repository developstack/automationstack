/**
 * Pure mapping between the platform module/case tree and mind-elixir data.
 *
 * Field shapes verified against mind-elixir@5.15.1 type declarations
 * (dist/types/types/index.d.ts): `MindElixirData { nodeData: NodeObj; ... }`,
 * `NodeObj<M> { topic; id; children?; tags?: (string | TagObj)[]; expanded?;
 * metadata?: M; ... }`, `TagObj { text; style?; className? }`.
 *
 * Input types below mirror the `mindmap.tree` payload described in
 * docs/phase1-testcase-platform-plan.md §2 (module tree + lightweight case
 * nodes); reconciling them with the real API types is a follow-up task.
 */

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

/** Lightweight case node as served by mindmap.tree (plan §2). */
export interface MindmapCaseInput {
	id: string;
	moduleId: string;
	name: string;
	priority: CasePriority;
	sortOrder: number;
	status: CaseStatus;
	/** Ordered `CaseStep[]`; rendered as read-only step/expected children. */
	steps: CaseStep[];
}

/** Module tree node as served by mindmap.tree (plan §2). */
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

/** Metadata attached to every generated node (`NodeObj.metadata`). */
export interface MindmapNodeMeta {
	/**
	 * Whether the user may attach new children here. False on case nodes (they
	 * only ever carry generated step children) and on step/expected nodes.
	 */
	allowChildren: boolean;
	kind: MindmapNodeKind;
}

export type MindmapNode = NodeObj<MindmapNodeMeta>;

/** Reverse ref for entity nodes; the project root maps to neither kind. */
export interface MindmapEntityRef {
	id: string;
	kind: "case" | "module";
}

/**
 * 优先级标签的配色必须跟着主题走：硬编码亮色 hex 在暗色画布上是刺眼的色块，
 * 而且与列表里的优先级体系对不上。这里复用 packages/ui 的语义令牌，
 * 并保持与 case-meta.ts 里 PRIORITY_BADGE_VARIANTS 相同的强度顺序：
 * P0 实心危险色 → P1 浅危险色 → P2 灰填充 → P3 无填充。
 *
 * P0 必须是实心：淡填充撑不起最高等级，而 --primary 在暗色下是 near-white
 * 实心，把它给 P1 会让 P1 压过 P0。列表视图与脑图视图对同一条用例必须给出
 * 同一个强调顺序，这两处的映射改一处就要改另一处。
 */
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

/** Builds the priority tag (with inline style) shown on a case node. */
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

/** `1. <step>` with the expected result as its only child (when non-empty). */
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

/**
 * Case nodes ship collapsed: a project with a few dozen cases would otherwise
 * open as a wall of step text. Cases without steps stay plain leaves so
 * mind-elixir does not draw an expander that reveals nothing.
 */
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

/** 哪些模块展开渲染由预算决定，见 mindmap-budget.ts。 */
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
		// 折叠的模块整棵子树都不进 DOM，但 `+` 还在，用户随时能自己展开。
		expanded: context.expandedModuleIds.has(module.id),
		id: encodeModuleNodeId(module.id),
		metadata: { allowChildren: true, kind: "module" },
		topic: module.name,
	};
}

/**
 * Maps the platform tree into mind-elixir data. Pure; inputs not mutated.
 * 传入 `plan` 可以复用调用方已经算好的预算（界面提示与画布必须用同一份）。
 */
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

/** Full reverse ref (any kind) from a mind-elixir node. */
export function getMindmapNodeRef(
	node: Pick<NodeObj, "id">
): MindmapNodeRef | null {
	return decodeMindmapNodeId(node.id);
}

/**
 * Reverse ref restricted to the kinds that can own a subtree the server knows
 * about (project | module | case). Step and expected nodes map to null: a node
 * parented under one has no `mindmap.batch` representation, so the operation
 * mapper must drop it rather than invent an entity id.
 */
export function getContainerNodeRef(
	node: Pick<NodeObj, "id">
): MindmapEntityNodeRef | null {
	const ref = decodeMindmapNodeId(node.id);
	return ref === null || isStepNodeRef(ref) ? null : ref;
}

/** Entity-only reverse ref: `{ kind: module | case, id }`, else null. */
export function getEntityNodeRef(
	node: Pick<NodeObj, "id">
): MindmapEntityRef | null {
	const ref = decodeMindmapNodeId(node.id);
	if (ref === null || isStepNodeRef(ref) || ref.kind === "project") {
		return null;
	}
	return { id: ref.id, kind: ref.kind };
}

/**
 * Guard for before-hooks. Only modules and the project root take children;
 * everything else — including ids this scheme does not recognise — is refused,
 * so an unknown prefix can never be mistaken for a permissive container.
 */
export function canHaveChildren(node: Pick<NodeObj, "id">): boolean {
	const kind = decodeMindmapNodeId(node.id)?.kind;
	return kind === "module" || kind === "project";
}
