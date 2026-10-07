export interface CaseVerdictEntry {
	editing: boolean;
	hasSteps: boolean;
}

export function canPickCaseVerdict(entry: CaseVerdictEntry): boolean {
	return entry.editing && !entry.hasSteps;
}
