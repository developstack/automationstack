export interface TestRunDraft {
	caseIds: string[];
	description: string;
	name: string;
}

function testRunDraftFingerprint(draft: TestRunDraft): string {
	return JSON.stringify([
		[...draft.caseIds].sort(),
		draft.description,
		draft.name,
	]);
}

export function isTestRunDraftDirty(
	draft: TestRunDraft,
	baseline: TestRunDraft
): boolean {
	return testRunDraftFingerprint(draft) !== testRunDraftFingerprint(baseline);
}
