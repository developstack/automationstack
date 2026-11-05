import { and, desc, eq } from "drizzle-orm";

import { db } from "../index";
import type { CaseSnapshot, CaseVersion } from "../schema/test-cases";
import { caseVersions } from "../schema/test-cases";
import type { CaseContentPatch } from "./case-snapshot-core";
import {
	withExplicitScreenshots,
	writeCaseMutation,
} from "./case-snapshot-core";
import type { CaseWriteResult, DbTransaction } from "./repository-types";

export interface CaseVersionSummary {
	caseId: string;
	changeNote: string | null;
	createdAt: Date;
	id: string;
	savedBy: string | null;
	version: number;
}

export function listCaseVersions(
	caseId: string
): Promise<CaseVersionSummary[]> {
	return db
		.select({
			caseId: caseVersions.caseId,
			changeNote: caseVersions.changeNote,
			createdAt: caseVersions.createdAt,
			id: caseVersions.id,
			savedBy: caseVersions.savedBy,
			version: caseVersions.version,
		})
		.from(caseVersions)
		.where(eq(caseVersions.caseId, caseId))
		.orderBy(desc(caseVersions.version));
}

async function getCaseVersionInTx(
	tx: DbTransaction,
	caseId: string,
	version: number
): Promise<CaseVersion | null> {
	const [row] = await tx
		.select()
		.from(caseVersions)
		.where(
			and(eq(caseVersions.caseId, caseId), eq(caseVersions.version, version))
		)
		.limit(1);
	return row ?? null;
}

export async function getCaseVersion(
	caseId: string,
	version: number
): Promise<CaseVersion | null> {
	const [row] = await db
		.select()
		.from(caseVersions)
		.where(
			and(eq(caseVersions.caseId, caseId), eq(caseVersions.version, version))
		)
		.limit(1);
	return row ?? null;
}

function snapshotToContentPatch(snapshot: CaseSnapshot): CaseContentPatch {
	return {
		caseType: snapshot.caseType,
		maintainer: snapshot.maintainer,
		name: snapshot.name,
		preconditions: snapshot.preconditions,
		priority: snapshot.priority,
		sourceRef: snapshot.sourceRef,
		status: snapshot.status,
		steps: withExplicitScreenshots(snapshot.steps),
		tags: snapshot.tags,
	};
}

export interface RollbackCaseInput {
	actorName: string | null;
	caseId: string;
	version: number;
}

export function rollbackCaseToVersion(
	input: RollbackCaseInput
): Promise<CaseWriteResult> {
	return db.transaction(async (tx) => {
		const versionRow = await getCaseVersionInTx(
			tx,
			input.caseId,
			input.version
		);
		if (!versionRow) {
			return { kind: "not-found" };
		}
		return writeCaseMutation(tx, {
			actorName: input.actorName,
			caseId: input.caseId,
			changeNote: `回滚至 v${input.version}`,
			patch: snapshotToContentPatch(versionRow.snapshot),
		});
	});
}
