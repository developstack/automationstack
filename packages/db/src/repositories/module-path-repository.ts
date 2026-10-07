import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "../index";
import { type Module, modules } from "../schema/modules";
import { projects } from "../schema/projects";
import { createModuleInTx } from "./modules-repository";
import type { DbTransaction } from "./repository-types";

export interface EnsureModulePathInput {
	path: string[];
	projectId: string;
}

export type EnsureModulePathResult =
	| { kind: "empty-path" }
	| { kind: "ok"; createdModuleIds: string[]; moduleId: string }
	| { kind: "project-not-found" };

async function projectExists(
	tx: DbTransaction,
	projectId: string
): Promise<boolean> {
	const [row] = await tx
		.select({ id: projects.id })
		.from(projects)
		.where(eq(projects.id, projectId))
		.limit(1);
	return Boolean(row);
}

async function findChildByName(
	tx: DbTransaction,
	group: { name: string; parentId: string | null; projectId: string }
): Promise<Module | null> {
	const parentCondition =
		group.parentId === null
			? isNull(modules.parentId)
			: eq(modules.parentId, group.parentId);
	const [row] = await tx
		.select()
		.from(modules)
		.where(
			and(
				eq(modules.projectId, group.projectId),
				parentCondition,
				eq(modules.name, group.name)
			)
		)
		.orderBy(asc(modules.sortOrder), asc(modules.createdAt))
		.limit(1);
	return row ?? null;
}

async function ensureChild(
	tx: DbTransaction,
	group: { name: string; parentId: string | null; projectId: string }
): Promise<{ created: boolean; moduleId: string }> {
	const existing = await findChildByName(tx, group);
	if (existing) {
		return { created: false, moduleId: existing.id };
	}
	const result = await createModuleInTx(tx, {
		name: group.name,
		parentId: group.parentId,
		projectId: group.projectId,
	});
	if (result.kind !== "ok") {
		throw new Error(`ensureModulePath: create failed (${result.kind})`);
	}
	return { created: true, moduleId: result.module.id };
}

async function ensureModulePathInTx(
	tx: DbTransaction,
	input: EnsureModulePathInput
): Promise<EnsureModulePathResult> {
	if (!(await projectExists(tx, input.projectId))) {
		return { kind: "project-not-found" };
	}
	const createdModuleIds: string[] = [];
	let parentId: string | null = null;
	for (const name of input.path) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐级依赖父级 id，必须串行
		const step = await ensureChild(tx, {
			name,
			parentId,
			projectId: input.projectId,
		});
		if (step.created) {
			createdModuleIds.push(step.moduleId);
		}
		parentId = step.moduleId;
	}
	if (parentId === null) {
		return { kind: "empty-path" };
	}
	return { createdModuleIds, kind: "ok", moduleId: parentId };
}

export function ensureModulePath(
	input: EnsureModulePathInput
): Promise<EnsureModulePathResult> {
	return db.transaction((tx) => ensureModulePathInTx(tx, input));
}
