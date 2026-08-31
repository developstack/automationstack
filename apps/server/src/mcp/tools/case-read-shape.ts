import type { CaseStep, TestCase } from "@automationstack/db/schema/test-cases";

/**
 * `read_cases` 的返回整形：两档详略 + `full` 档的分页上限。
 *
 * 为什么必须有这一层（不是直接把 `cases.list` 的行发出去）：`cases.list` 恒返回
 * 完整用例行，`pageSize` 上限 100。一百条带 `steps` 正文的用例足以一次吃掉本地
 * agent 半个上下文窗口——而这个工具存在的全部理由，恰恰是让 agent **有预算**
 * 读到已有用例的正文。不压上限就等于把「上下文饥饿」换成「上下文中毒」。
 *
 * 纯函数、只 import type，因此配套测试不连库、不需要 `DATABASE_URL`。
 */

/** `summary` 只有摘要字段；`full` 额外带 `preconditions` 与 `steps` 正文。 */
export type CaseDetail = "full" | "summary";

/** `full` 档不显式给 pageSize 时的条数。10 条正文足够当风格样本与查重锚点。 */
export const FULL_DEFAULT_PAGE_SIZE = 10;

/** `full` 档的硬上限：再多就不是「读上下文」而是「灌上下文」了。 */
export const FULL_MAX_PAGE_SIZE = 20;

/** 摘要行：足够判断「有没有这条、归在哪、什么档」，但不含正文。 */
export interface CaseSummaryRow {
	caseType: TestCase["caseType"];
	id: string;
	maintainer: string | null;
	moduleId: string;
	name: string;
	priority: TestCase["priority"];
	sourceRef: string | null;
	status: TestCase["status"];
	tags: string[];
	updatedAt: Date;
}

/** 完整行：摘要 + 正文。刻意不含 projectId / sortOrder / 版本与审计字段。 */
export interface CaseFullRow extends CaseSummaryRow {
	preconditions: string | null;
	steps: CaseStep[];
}

export interface ReadCasesPage {
	detail: CaseDetail;
	items: CaseFullRow[] | CaseSummaryRow[];
	page: number;
	pageSize: number;
	total: number;
}

/**
 * 决定这次真正下发给 `cases.list` 的 pageSize。
 *
 * `summary` 档原样透传（上限由 `cases.list` 的 schema 管，100）；
 * `full` 档不给就 10、给了也最多 20。上限写在这里而不是 zod schema 里，
 * 是因为它依赖 `detail`——同一个 `pageSize: 50` 在两档下的合法性不同，
 * 而 zod 的 `.max()` 只能给出与另一个字段无关的常量。
 */
export function resolveReadPageSize(
	detail: CaseDetail,
	pageSize: number | undefined
): number | undefined {
	if (detail === "summary") {
		return pageSize;
	}
	if (pageSize === undefined) {
		return FULL_DEFAULT_PAGE_SIZE;
	}
	return Math.min(pageSize, FULL_MAX_PAGE_SIZE);
}

function toSummaryRow(row: TestCase): CaseSummaryRow {
	return {
		caseType: row.caseType,
		id: row.id,
		maintainer: row.maintainer,
		moduleId: row.moduleId,
		name: row.name,
		priority: row.priority,
		sourceRef: row.sourceRef,
		status: row.status,
		tags: row.tags,
		updatedAt: row.updatedAt,
	};
}

function toFullRow(row: TestCase): CaseFullRow {
	return {
		...toSummaryRow(row),
		preconditions: row.preconditions,
		steps: row.steps,
	};
}

/** 列表结果 → 工具返回：按 `detail` 裁剪每一行，分页元数据原样带出。 */
export function shapeReadCases(
	result: { items: TestCase[]; page: number; pageSize: number; total: number },
	detail: CaseDetail
): ReadCasesPage {
	return {
		detail,
		items:
			detail === "full"
				? result.items.map(toFullRow)
				: result.items.map(toSummaryRow),
		page: result.page,
		pageSize: result.pageSize,
		total: result.total,
	};
}
