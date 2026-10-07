export const CASE_FIELD_GRID_COLUMNS = 6;

export const CASE_FIELD_GRID_CLASS =
	"grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-6";

export type CaseFieldKey =
	| "caseType"
	| "maintainer"
	| "name"
	| "priority"
	| "status"
	| "tags";

export const CASE_FIELD_SPAN_CLASS: Record<CaseFieldKey, string> = {
	caseType: "sm:col-span-2",
	maintainer: "sm:col-span-2",
	name: "sm:col-span-6",
	priority: "sm:col-span-2",
	status: "sm:col-span-2",
	tags: "sm:col-span-4",
};

export const CASE_FIELD_ROWS: readonly (readonly CaseFieldKey[])[] = [
	["name"],
	["maintainer", "tags"],
	["priority", "caseType", "status"],
];
