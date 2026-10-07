import { and, desc, eq, ilike } from "drizzle-orm";

import { db } from "../index";
import type { CasePriority, CaseStatus, CaseType } from "../schema/test-cases";
import { testCases } from "../schema/test-cases";

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;

const LIKE_SPECIAL_CHARS = /[%_\\]/g;

export interface CaseSearchHit {
	caseType: CaseType;
	id: string;
	moduleId: string;
	name: string;
	priority: CasePriority;
	sourceRef: string | null;
	status: CaseStatus;
	updatedAt: Date;
}

export interface SearchTestCasesInput {
	keyword: string;
	limit?: number;
	projectId: string;
}

export function searchTestCases(
	input: SearchTestCasesInput
): Promise<CaseSearchHit[]> {
	const escaped = input.keyword.replace(LIKE_SPECIAL_CHARS, "\\$&");
	const limit = Math.min(
		Math.max(input.limit ?? SEARCH_DEFAULT_LIMIT, 1),
		SEARCH_MAX_LIMIT
	);
	return db
		.select({
			caseType: testCases.caseType,
			id: testCases.id,
			moduleId: testCases.moduleId,
			name: testCases.name,
			priority: testCases.priority,
			sourceRef: testCases.sourceRef,
			status: testCases.status,
			updatedAt: testCases.updatedAt,
		})
		.from(testCases)
		.where(
			and(
				eq(testCases.projectId, input.projectId),
				ilike(testCases.name, `%${escaped}%`)
			)
		)
		.orderBy(desc(testCases.updatedAt))
		.limit(limit);
}
