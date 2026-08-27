/**
 * `CaseCatalog` 端口的 Postgres 适配器。
 *
 * **架构铁律**：本目录只做端口 ↔ repository 的映射，一行 SQL 都不写。
 * 所有查询与事务留在 `packages/db/src/repositories/`。
 */
import type {
	CaseCatalog,
	ExistingCaseSummary,
} from "@automationstack/agent/ports";

import { listTestCases } from "../repositories/case-list-repository";
import { listModulesByProject } from "../repositories/modules-repository";
import type { TestCase } from "../schema/test-cases";
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
 * projectId 作为闭包，保证 agent 只能读到当前项目的数据。
 */
export function createCaseCatalog(projectId: string): CaseCatalog {
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
	};
}
