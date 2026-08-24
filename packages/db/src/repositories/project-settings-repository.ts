import { eq } from "drizzle-orm";

import { db } from "../index";
import {
	DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	type ProjectSettings,
	projectSettings,
} from "../schema/project-settings";
import type { DbTransaction } from "./repository-types";

/**
 * 读取方看到的项目设置：**永远是一个完整对象，不会是 null**。
 *
 * 设置行是懒创建的（没进过设置页的项目根本没有行），如果这里把「没有行」
 * 原样透给调用方，那么每一个用到设置的地方——读路径上的自动提交结算、报告页、
 * 将来任何新配置项——都要各自记得兜一次默认值，漏一处就是一个静默的行为分叉。
 * 兜底只做一次，就做在这里。
 */
export interface ProjectSettingsView {
	autoSubmitAfterCompletedDays: number;
	/**
	 * `false` = 该项目从未保存过设置，上面的值全部来自兜底默认。
	 * 设置页据此把输入框显示成「默认 3 天」而不是让用户以为有人配过。
	 */
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

/** 项目设置，无行时返回带兜底默认值的对象（`configured: false`）。 */
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

/**
 * 保存项目设置：没有行就插一行，有行就改。
 *
 * 走 `onConflictDoUpdate` 打在 `project_settings_project_id_uq` 上，而不是
 * 应用层「先 select 再决定 insert / update」——后者在两个人同时保存时会撞唯一
 * 索引报错，而这本该是一次正常保存。
 *
 * 取值区间由 `project_settings_auto_submit_days_range` 这条 CHECK 兜底；
 * 越界会以数据库异常形式抛出，API 层应当先用
 * `MIN/MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS` 做 zod 校验给出友好提示。
 */
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
			// 只覆盖本次真正给了值的字段：设置页将来会有第二、第三个配置项，
			// 局部保存不该把没在表单里的字段冲回默认值。
			// `updatedAt` 恒在 set 里，一是保证 set 子句永远非空（全空是非法 SQL），
			// 二是 `$onUpdate` 不会在 upsert 的冲突分支上触发，只能显式写。
			set: buildUpdateSet(input),
			target: projectSettings.projectId,
		})
		.returning();
	if (!row) {
		throw new Error("upsertProjectSettings: upsert returned no row");
	}
	return row;
}
