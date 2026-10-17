import type { CaseStep, TestCase } from "@automationstack/db/schema/test-cases";

export type CaseDetail = "full" | "summary";

export const FULL_DEFAULT_PAGE_SIZE = 10;

export const FULL_MAX_PAGE_SIZE = 20;

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
		// 只返回这三个字段。迁移 0019 以前的步骤可能还带 screenshots，MCP 不返回截图
		steps: row.steps.map(({ expected, id, step }) => ({ expected, id, step })),
	};
}

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
