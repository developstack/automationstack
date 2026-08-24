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

/**
 * 用例被测试任务引用，删除被拒（plan §3.4）。
 *
 * 与乐观锁冲突一样走类型化返回而不是抛异常：这是可预期的业务分支，
 * router 要把 `referencedByRunCount` 拼进给用户看的文案，异常里带不了结构化数据。
 */
export interface CaseDeleteBlocked {
	kind: "blocked";
	referencedByRunCount: number;
}

/** 删除成功，回带被删的行（调用方据此拿到 projectId / moduleId 发失效事件）。 */
export interface CaseDeleteRemoved {
	kind: "removed";
	testCase: TestCase;
}

export type RemoveTestCaseResult =
	| CaseDeleteBlocked
	| CaseDeleteRemoved
	| RepositoryNotFound;

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
