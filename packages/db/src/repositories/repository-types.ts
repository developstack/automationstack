import type { db } from "../index";
import type { CaseVersion, TestCase } from "../schema/test-cases";

/** Drizzle transaction handle used by all `*InTx` repository functions. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Optimistic-lock failure: someone saved a newer version first. */
export interface CaseWriteConflict {
	currentVersion: number;
	kind: "conflict";
	lastModifiedBy: string | null;
}

/** Target row does not exist (or was deleted concurrently). */
export interface RepositoryNotFound {
	kind: "not-found";
}

/** Successful snapshot write: updated row plus the version row it produced. */
export interface CaseWriteSuccess {
	kind: "written";
	testCase: TestCase;
	version: CaseVersion;
}

/**
 * The patch already matched the stored content, so nothing was written:
 * no `current_version` bump and no `case_versions` row. Keeps empty saves
 * (open the editor, change nothing, hit 保存) out of the version history.
 */
export interface CaseWriteUnchanged {
	kind: "unchanged";
	testCase: TestCase;
}

export type CaseWriteResult =
	| CaseWriteConflict
	| CaseWriteSuccess
	| CaseWriteUnchanged
	| RepositoryNotFound;
