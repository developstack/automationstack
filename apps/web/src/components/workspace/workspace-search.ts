/**
 * Zod schema for the workspace list-view search params.
 * The URL is the single source of truth for the current selection
 * (module, case, filters, history panel) so deep links, back/forward
 * and tab switches all restore the same state.
 */
import {
	casePrioritySchema,
	caseStatusSchema,
} from "@automationstack/api/schemas/case";
import { z } from "zod";

export const workspaceSearchSchema = z.object({
	/** Opens the case detail sheet for this case id. */
	caseId: z.uuid().optional(),
	/** Shows the version history panel inside the detail sheet. */
	history: z.boolean().optional(),
	/** Case name keyword filter (debounced input). */
	kw: z.string().optional(),
	/** Selected module in the left tree; absent = whole project. */
	moduleId: z.uuid().optional(),
	/** 1-based case list page; absent = first page. */
	page: z.number().int().min(1).optional(),
	priority: z.array(casePrioritySchema).optional(),
	status: caseStatusSchema.optional(),
	/** Tag filter (any-of); values come from `cases.listTags`. */
	tags: z.array(z.string()).optional(),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

/**
 * Stable `search` reducers for <Link>/navigate. They live at module scope so
 * JSX props never receive a freshly created closure (lint/performance/noJsxPropsBind).
 */
export type WorkspaceSearchReducer = (prev: WorkspaceSearch) => WorkspaceSearch;

/** Carries every current param forward unchanged (view switcher tabs). */
export const keepWorkspaceSearch: WorkspaceSearchReducer = (prev) => prev;

/** Closes the case detail sheet and its version-history panel. */
export const clearCaseSelection: WorkspaceSearchReducer = (prev) => ({
	...prev,
	caseId: undefined,
	history: undefined,
});

/**
 * Selects the whole project: no module filter, no open case.
 * Also resets the page — the previous page number rarely exists in the new
 * scope, and landing on an empty page looks like data loss.
 */
export const clearModuleSelection: WorkspaceSearchReducer = (prev) => ({
	...clearCaseSelection(prev),
	moduleId: undefined,
	page: undefined,
});

/** Drops every case filter and returns to the first page. */
export const clearCaseFilters: WorkspaceSearchReducer = (prev) => ({
	...prev,
	kw: undefined,
	page: undefined,
	priority: undefined,
	status: undefined,
	tags: undefined,
});

/** Whether any filter is narrowing the case list right now. */
export function hasCaseFilters(search: WorkspaceSearch): boolean {
	return (
		(search.kw ?? "") !== "" ||
		search.status !== undefined ||
		(search.priority?.length ?? 0) > 0 ||
		(search.tags?.length ?? 0) > 0
	);
}
