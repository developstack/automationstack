import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateUpTo, runMigration } from "./migration-harness";
import {
	NOT_SHOT,
	SHOT,
	seedStepScreenshotFixtures,
	storageKeyOf,
} from "./remove-step-screenshots-fixtures";

const TAG = "0019_remove_step_screenshots";

type Row = Record<string, unknown>;

const byText = (a: string, b: string) => (a < b ? -1 : Number(a > b));

interface Dump {
	attachments: string[];
	caseVersions: Row[];
	runCases: Row[];
	testCases: Row[];
}

async function rows<T = Row>(db: PGlite, sql: string): Promise<T[]> {
	return (await db.query<T>(sql)).rows;
}

async function dump(db: PGlite): Promise<Dump> {
	const json = async (table: string) =>
		(
			await rows<{ row: Row }>(
				db,
				`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`
			)
		).map((item) => item.row);
	return {
		attachments: (
			await rows<{ id: string }>(db, "SELECT id FROM case_attachments")
		)
			.map((item) => item.id)
			.sort(byText),
		caseVersions: await json("case_versions"),
		runCases: await json("test_run_cases"),
		testCases: await json("test_cases"),
	};
}

function purgeRows(db: PGlite) {
	return rows<{ attachment_id: string; storage_key: string }>(
		db,
		"SELECT attachment_id, storage_key FROM step_screenshot_purge ORDER BY attachment_id"
	);
}

function withoutScreenshots(steps: Row[]): Row[] {
	return steps.map(({ screenshots: _dropped, ...rest }) => rest);
}

const DELETED: string[] = [
	SHOT.onlyInCurrentStep,
	SHOT.onlyInOldVersion,
	SHOT.mentionedWithoutRefSyntax,
].sort(byText);

describe("迁移 0019：删除步骤截图", () => {
	const db = new PGlite();
	let before: Dump;
	let after: Dump;

	beforeAll(async () => {
		await migrateUpTo(db, TAG);
		await seedStepScreenshotFixtures(db);
		before = await dump(db);
		await runMigration(db, TAG);
		after = await dump(db);
	}, 60_000);

	afterAll(async () => {
		await db.close();
	});

	it("deletes only the attachments that step screenshots reference and no text references", () => {
		expect(before.attachments).toEqual(
			[...Object.values(SHOT), ...Object.values(NOT_SHOT)].sort(byText)
		);
		expect(after.attachments).toEqual(
			before.attachments.filter((id) => !DELETED.includes(id))
		);
	});

	it.each([
		["the preconditions of the case", SHOT.inPreconditions],
		["the step text", SHOT.inStepText],
		["the expected text, with an upper-case id", SHOT.inExpectedText],
		["only an old version snapshot", SHOT.inVersionText],
		["the text of another case", SHOT.inOtherCaseText],
		["a test run comment", SHOT.inRunComment],
		["an old result change comment", SHOT.inRunEventComment],
		["only text, never a step screenshot", NOT_SHOT.inlineOnly],
		["nothing", NOT_SHOT.unreferenced],
	])("keeps an attachment that %s references", (_where, attachmentId) => {
		expect(after.attachments).toContain(attachmentId);
	});

	it("queues the storage key of each deleted attachment for the R2 cleanup", async () => {
		expect(await purgeRows(db)).toEqual(
			DELETED.map((id) => ({
				attachment_id: id,
				storage_key: storageKeyOf(id),
			}))
		);
	});

	it("removes the screenshots key from current steps and changes no other value", () => {
		expect(after.testCases).toEqual(
			before.testCases.map((row) => ({
				...row,
				steps: withoutScreenshots(row.steps as Row[]),
			}))
		);
	});

	it("removes the screenshots key from every version snapshot and changes no other value", () => {
		expect(after.caseVersions).toEqual(
			before.caseVersions.map((row) => {
				const snapshot = row.snapshot as { steps: Row[] };
				return {
					...row,
					snapshot: { ...snapshot, steps: withoutScreenshots(snapshot.steps) },
				};
			})
		);
	});

	it("leaves test run data unchanged", () => {
		expect(after.runCases).toEqual(before.runCases);
	});

	it("changes nothing and does not fail when it runs again", async () => {
		const queued = await purgeRows(db);
		await runMigration(db, TAG);
		expect(await dump(db)).toEqual(after);
		expect(await purgeRows(db)).toEqual(queued);
	});
});
