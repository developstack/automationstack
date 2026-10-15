import { eq, sql } from "drizzle-orm";

import type {
	CasePriority,
	CaseSnapshot,
	CaseStatus,
	CaseStep,
	CaseType,
	CaseVersion,
	TestCase,
} from "../schema/test-cases";
import { caseVersions, testCases } from "../schema/test-cases";
import type { CaseWriteResult, DbTransaction } from "./repository-types";

export interface CaseContentPatch {
	caseType?: CaseType;
	maintainer?: string | null;
	name?: string;
	preconditions?: string | null;
	priority?: CasePriority;
	sourceRef?: string | null;
	status?: CaseStatus;
	steps?: CaseStep[];
	tags?: string[];
}

export interface WriteCaseMutationOptions {
	actorName: string | null;
	caseId: string;
	changeNote?: string | null;
	expectedVersion?: number;
	patch: CaseContentPatch;
}

export function toCaseSnapshot(row: TestCase): CaseSnapshot {
	return {
		caseType: row.caseType,
		maintainer: row.maintainer,
		moduleId: row.moduleId,
		name: row.name,
		preconditions: row.preconditions,
		priority: row.priority,
		sourceRef: row.sourceRef,
		status: row.status,
		steps: row.steps,
		tags: row.tags,
	};
}

export async function insertCaseVersion(
	tx: DbTransaction,
	options: { changeNote?: string | null; row: TestCase; savedBy: string | null }
): Promise<CaseVersion> {
	const [version] = await tx
		.insert(caseVersions)
		.values({
			caseId: options.row.id,
			changeNote: options.changeNote ?? null,
			savedBy: options.savedBy,
			snapshot: toCaseSnapshot(options.row),
			version: options.row.currentVersion,
		})
		.returning();
	if (!version) {
		throw new Error("insertCaseVersion: insert returned no row");
	}
	return version;
}

const SCALAR_CONTENT_KEYS = [
	"caseType",
	"maintainer",
	"name",
	"preconditions",
	"priority",
	"sourceRef",
	"status",
] as const satisfies readonly (keyof CaseContentPatch)[];

function sameList(
	stored: readonly string[],
	patched: readonly string[]
): boolean {
	return (
		stored.length === patched.length &&
		stored.every((item, index) => item === patched[index])
	);
}

function sameSteps(
	stored: readonly CaseStep[],
	patched: readonly CaseStep[]
): boolean {
	return (
		stored.length === patched.length &&
		stored.every((step, index) => {
			const other = patched[index];
			return (
				other !== undefined &&
				step.id === other.id &&
				step.step === other.step &&
				step.expected === other.expected &&
				sameList(step.screenshots ?? [], other.screenshots ?? [])
			);
		})
	);
}

/**
 * 外部工具（MCP、导入、其他 API）写入的步骤可能不带 screenshots。
 * 这时 id 相同的步骤保留现有的步骤截图；新的步骤 id 没有步骤截图。
 */
export function mergeStepScreenshots(
	stored: readonly CaseStep[],
	patched: readonly CaseStep[]
): CaseStep[] {
	const storedById = new Map(stored.map((step) => [step.id, step]));
	return patched.map((step) => {
		if (step.screenshots !== undefined) {
			return step;
		}
		const kept = storedById.get(step.id)?.screenshots;
		return kept === undefined ? step : { ...step, screenshots: kept };
	});
}

function withMergedScreenshots(
	row: TestCase,
	patch: CaseContentPatch
): CaseContentPatch {
	if (patch.steps === undefined) {
		return patch;
	}
	return { ...patch, steps: mergeStepScreenshots(row.steps, patch.steps) };
}

export function isNoopCasePatch(
	row: TestCase,
	patch: CaseContentPatch
): boolean {
	if (patch.steps !== undefined && !sameSteps(row.steps, patch.steps)) {
		return false;
	}
	if (patch.tags !== undefined && !sameList(row.tags, patch.tags)) {
		return false;
	}
	return SCALAR_CONTENT_KEYS.every(
		(key) => patch[key] === undefined || patch[key] === row[key]
	);
}

export async function writeCaseMutation(
	tx: DbTransaction,
	options: WriteCaseMutationOptions
): Promise<CaseWriteResult> {
	const [current] = await tx
		.select()
		.from(testCases)
		.where(eq(testCases.id, options.caseId))
		.for("update")
		.limit(1);
	if (!current) {
		return { kind: "not-found" };
	}
	if (
		options.expectedVersion !== undefined &&
		options.expectedVersion !== current.currentVersion
	) {
		return {
			currentVersion: current.currentVersion,
			kind: "conflict",
			lastModifiedBy: current.lastModifiedBy,
		};
	}
	const patch = withMergedScreenshots(current, options.patch);
	if (isNoopCasePatch(current, patch)) {
		return { kind: "unchanged", testCase: current };
	}
	const [updated] = await tx
		.update(testCases)
		.set({
			...patch,
			currentVersion: sql`${testCases.currentVersion} + 1`,
			lastModifiedBy: options.actorName,
		})
		.where(eq(testCases.id, options.caseId))
		.returning();
	if (!updated) {
		throw new Error("writeCaseMutation: update lost the locked row");
	}
	const version = await insertCaseVersion(tx, {
		changeNote: options.changeNote,
		row: updated,
		savedBy: options.actorName,
	});
	return { kind: "written", testCase: updated, version };
}
