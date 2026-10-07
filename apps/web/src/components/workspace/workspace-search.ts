import {
	casePrioritySchema,
	caseStatusSchema,
} from "@automationstack/api/schemas/case";
import { z } from "zod";

export const workspaceSearchSchema = z.object({
	caseId: z.uuid().optional(),
	create: z.boolean().optional(),
	draft: z.uuid().optional(),
	history: z.boolean().optional(),
	kw: z.string().optional(),
	moduleId: z.uuid().optional(),
	page: z.number().int().min(1).optional(),
	priority: z.array(casePrioritySchema).optional(),
	status: caseStatusSchema.optional(),
	tags: z.array(z.string()).optional(),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

export type WorkspaceSearchReducer = (prev: WorkspaceSearch) => WorkspaceSearch;

export const keepWorkspaceSearch: WorkspaceSearchReducer = (prev) => prev;

export const clearCaseSelection: WorkspaceSearchReducer = (prev) => ({
	...prev,
	caseId: undefined,
	history: undefined,
});

export const clearModuleSelection: WorkspaceSearchReducer = (prev) => ({
	...clearCaseSelection(prev),
	create: undefined,
	draft: undefined,
	moduleId: undefined,
	page: undefined,
});

export const clearCaseFilters: WorkspaceSearchReducer = (prev) => ({
	...prev,
	kw: undefined,
	page: undefined,
	priority: undefined,
	status: undefined,
	tags: undefined,
});

export function hasCaseFilters(search: WorkspaceSearch): boolean {
	return (
		(search.kw ?? "") !== "" ||
		search.status !== undefined ||
		(search.priority?.length ?? 0) > 0 ||
		(search.tags?.length ?? 0) > 0
	);
}

export function resumeDraftSearch(
	moduleId: string,
	draftId: string
): WorkspaceSearchReducer {
	return (prev) => ({
		...clearCaseSelection(prev),
		create: true,
		draft: draftId,
		moduleId,
		page: undefined,
	});
}
