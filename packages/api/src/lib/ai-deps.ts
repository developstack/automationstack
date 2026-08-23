import type { AgentDeps, ExistingCaseSummary } from "@automationstack/ai/tools";
import { insertCaseProposals } from "@automationstack/db/repositories/ai-proposals-repository";
import { listModulesByProject } from "@automationstack/db/repositories/modules-repository";
import { listTestCases } from "@automationstack/db/repositories/test-cases-repository";
import type { TestCase } from "@automationstack/db/schema/test-cases";

import { formatModuleOutline } from "./module-outline";

/** 去重参考用的已有用例上限，避免把整个模块塞进上下文。 */
const EXISTING_CASE_LIMIT = 50;

function toExistingCaseSummary(row: TestCase): ExistingCaseSummary {
	return {
		caseType: row.caseType,
		id: row.id,
		name: row.name,
		priority: row.priority,
		tags: row.tags,
	};
}

/**
 * 把 packages/ai 的数据访问接口接到 packages/db 的 repository 上。
 * projectId 作为闭包，保证 agent 只能读写当前项目的数据。
 */
export function createAgentDeps(projectId: string): AgentDeps {
	return {
		listModulesOutline: async (targetProjectId) =>
			formatModuleOutline(await listModulesByProject(targetProjectId)),
		readExistingCases: async (moduleId) => {
			const result = await listTestCases({
				moduleId,
				pageSize: EXISTING_CASE_LIMIT,
				projectId,
			});
			return result.items.map(toExistingCaseSummary);
		},
		saveProposals: (sessionId, proposals) =>
			insertCaseProposals(sessionId, proposals),
	};
}
