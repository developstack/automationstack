import { eq } from "drizzle-orm";

import { db } from "../index";
import {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	type ProjectSettings,
	projectSettings,
} from "../schema/project-settings";
import type { DbTransaction } from "./repository-types";

export interface ProjectSettingsView {
	autoSubmitAfterCompletedDays: number;
	configured: boolean;
	projectId: string;
}

function toView(projectId: string, row: ProjectSettings | undefined) {
	return {
		autoSubmitAfterCompletedDays:
			row?.autoSubmitAfterCompletedDays ??
			DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
		configured: row !== undefined,
		projectId,
	};
}

export async function getProjectSettingsInTx(
	tx: DbTransaction,
	projectId: string
): Promise<ProjectSettingsView> {
	const [row] = await tx
		.select()
		.from(projectSettings)
		.where(eq(projectSettings.projectId, projectId))
		.limit(1);
	return toView(projectId, row);
}

export async function getProjectSettings(
	projectId: string
): Promise<ProjectSettingsView> {
	const [row] = await db
		.select()
		.from(projectSettings)
		.where(eq(projectSettings.projectId, projectId))
		.limit(1);
	return toView(projectId, row);
}

export interface UpsertProjectSettingsInput {
	autoSubmitAfterCompletedDays?: number;
}

function buildUpdateSet(input: UpsertProjectSettingsInput) {
	const patch: Partial<ProjectSettings> = { updatedAt: new Date() };
	if (input.autoSubmitAfterCompletedDays !== undefined) {
		patch.autoSubmitAfterCompletedDays = input.autoSubmitAfterCompletedDays;
	}
	return patch;
}

export async function upsertProjectSettings(
	projectId: string,
	input: UpsertProjectSettingsInput
): Promise<ProjectSettings> {
	const [row] = await db
		.insert(projectSettings)
		.values({
			autoSubmitAfterCompletedDays: input.autoSubmitAfterCompletedDays,
			projectId,
		})
		.onConflictDoUpdate({
			set: buildUpdateSet(input),
			target: projectSettings.projectId,
		})
		.returning();
	if (!row) {
		throw new Error("upsertProjectSettings: upsert returned no row");
	}
	return row;
}
