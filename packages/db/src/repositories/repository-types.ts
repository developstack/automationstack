import type { db } from "../index";
import type { CaseVersion, TestCase } from "../schema/test-cases";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CaseWriteConflict {
	currentVersion: number;
	kind: "conflict";
	lastModifiedBy: string | null;
}

export interface RepositoryNotFound {
	kind: "not-found";
}

export interface CaseDeleteBlocked {
	kind: "blocked";
	referencedByRunCount: number;
}

export interface CaseDeleteRemoved {
	kind: "removed";
	testCase: TestCase;
}

export type RemoveTestCaseResult =
	| CaseDeleteBlocked
	| CaseDeleteRemoved
	| RepositoryNotFound;

export interface CaseWriteSuccess {
	kind: "written";
	testCase: TestCase;
	version: CaseVersion;
}

export interface CaseWriteUnchanged {
	kind: "unchanged";
	testCase: TestCase;
}

export type CaseWriteResult =
	| CaseWriteConflict
	| CaseWriteSuccess
	| CaseWriteUnchanged
	| RepositoryNotFound;
