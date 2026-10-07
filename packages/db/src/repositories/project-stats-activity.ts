import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import { caseVersions, testCases } from "../schema/test-cases";

const RECENT_CHANGE_LIMIT = 10;

export interface RecentChangeRow {
	caseId: string;
	caseName: string;
	changeNote: string | null;
	createdAt: Date;
	savedBy: string | null;
	version: number;
	versionId: string;
}

export function getRecentChanges(
	projectId: string
): Promise<RecentChangeRow[]> {
	return db
		.select({
			caseId: caseVersions.caseId,
			caseName: testCases.name,
			changeNote: caseVersions.changeNote,
			createdAt: caseVersions.createdAt,
			savedBy: caseVersions.savedBy,
			version: caseVersions.version,
			versionId: caseVersions.id,
		})
		.from(caseVersions)
		.innerJoin(testCases, eq(caseVersions.caseId, testCases.id))
		.where(eq(testCases.projectId, projectId))
		.orderBy(desc(caseVersions.createdAt), desc(caseVersions.id))
		.limit(RECENT_CHANGE_LIMIT);
}
