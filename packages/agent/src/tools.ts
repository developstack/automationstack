import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { AgentPorts } from "./ports";
import type { CasePriority, CaseType, ProposedCase } from "./types";
import { zodTool } from "./zod-tool";

const CASE_NAME_MAX_LENGTH = 200;
const MAX_PROPOSALS_PER_BATCH = 10;

const casePriorityValues = [
	"P0",
	"P1",
	"P2",
	"P3",
] as const satisfies readonly CasePriority[];

const caseTypeValues = [
	"functional",
	"interface",
	"performance",
	"security",
	"compatibility",
	"other",
] as const satisfies readonly CaseType[];

const proposedStepSchema = z.object({
	expected: z.string().min(1).describe("该步骤可验证的预期结果"),
	step: z.string().min(1).describe("单一操作步骤描述"),
});

export const proposedCaseSchema = z.object({
	caseType: z.enum(caseTypeValues).describe("用例类型"),
	name: z
		.string()
		.min(1)
		.max(CASE_NAME_MAX_LENGTH)
		.describe("用例名称，简洁明确"),
	preconditions: z
		.string()
		.nullable()
		.optional()
		.describe("前置条件，没有则省略"),
	priority: z.enum(casePriorityValues).describe("优先级，P0 最高"),
	steps: z.array(proposedStepSchema).min(1).describe("操作步骤列表"),
	tags: z
		.array(z.string().min(1))
		.optional()
		.describe("场景标签，如 正常流 / 边界 / 异常"),
});

type ProposedCaseInput = z.infer<typeof proposedCaseSchema>;

/** 一条已持久化的提案（id 由 `SessionStore.saveProposals` 返回）。 */
export interface SavedProposal {
	id: string;
	proposal: ProposedCase;
}

export interface AgentToolContext {
	/** propose_cases 成功落库后回调（agent 借此产出 proposal 事件）。 */
	onProposalsSaved?: (saved: SavedProposal[]) => void;
	projectId: string;
	sessionId: string;
}

export interface ProposeCasesOutput {
	proposalIds: string[];
	savedCount: number;
}

function toProposedCase(input: ProposedCaseInput): ProposedCase {
	return {
		caseType: input.caseType,
		name: input.name,
		preconditions: input.preconditions ?? null,
		priority: input.priority,
		steps: input.steps.map((step) => ({
			expected: step.expected,
			id: randomUUID(),
			step: step.step,
		})),
		tags: input.tags ?? [],
	};
}

function zipSavedProposals(
	proposalIds: string[],
	proposals: ProposedCase[]
): SavedProposal[] {
	return proposalIds.flatMap((id, index) => {
		const proposal = proposals[index];
		return proposal ? [{ id, proposal }] : [];
	});
}

/**
 * 以依赖注入方式创建 agent 的三个工具。
 *
 * 三个工具全部只经端口取数/落盘（`caseCatalog` 只读、`sessionStore` 只写），
 * 本包因此不含任何 SQL、连接串或环境变量。
 */
export function createAgentTools(ports: AgentPorts, context: AgentToolContext) {
	return {
		list_modules: zodTool({
			description:
				"查看项目的模块树大纲（含模块 id），用于了解业务结构并选择目标模块。",
			execute: () => ports.caseCatalog.listModulesOutline(context.projectId),
			inputSchema: z.object({}),
			label: "查看模块大纲",
			name: "list_modules",
		}),
		propose_cases: zodTool({
			description:
				"提交一批测试用例提案（每批最多 10 条），提案会持久化等待人工评审。可多次调用分批提交。",
			execute: async ({ proposals }): Promise<ProposeCasesOutput> => {
				const normalized = proposals.map(toProposedCase);
				const proposalIds = await ports.sessionStore.saveProposals(
					context.sessionId,
					normalized
				);
				context.onProposalsSaved?.(zipSavedProposals(proposalIds, normalized));
				return { proposalIds, savedCount: proposalIds.length };
			},
			inputSchema: z.object({
				proposals: z
					.array(proposedCaseSchema)
					.min(1)
					.max(MAX_PROPOSALS_PER_BATCH)
					.describe("本批提交的用例提案列表"),
			}),
			label: "提交用例提案",
			name: "propose_cases",
		}),
		read_existing_cases: zodTool({
			description: "读取指定模块下已有用例的摘要，用于避免生成重复用例。",
			execute: ({ moduleId }) => ports.caseCatalog.readExistingCases(moduleId),
			inputSchema: z.object({
				moduleId: z.string().min(1).describe("目标模块的 id"),
			}),
			label: "读取已有用例",
			name: "read_existing_cases",
		}),
	};
}

export type AgentToolSet = ReturnType<typeof createAgentTools>;
