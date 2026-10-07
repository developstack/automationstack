export interface PassRateCounts {
	failed: number;
	passed: number;
}

export interface CompletionCounts {
	total: number;
	untested: number;
}

export function computeCompletionRate(counts: CompletionCounts): number | null {
	if (counts.total === 0) {
		return null;
	}
	return (counts.total - counts.untested) / counts.total;
}

export function computePassRate(counts: PassRateCounts): number | null {
	const denominator = counts.passed + counts.failed;
	if (denominator === 0) {
		return null;
	}
	return counts.passed / denominator;
}
