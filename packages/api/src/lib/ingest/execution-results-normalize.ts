import {
	type IngestExecutionResult,
	MAX_INGEST_COMMENT_LENGTH,
} from "./execution-contract";

const TRUNCATION_MARKER = "…（已截断）";

export function findDuplicateSourceRefs(
	results: IngestExecutionResult[]
): string[] {
	const seen = new Set<string>();
	const duplicated = new Set<string>();
	for (const item of results) {
		if (seen.has(item.sourceRef)) {
			duplicated.add(item.sourceRef);
			continue;
		}
		seen.add(item.sourceRef);
	}
	return [...duplicated];
}

export function normalizeIngestComment(
	message: string | null | undefined
): string | null {
	if (message === null || message === undefined) {
		return null;
	}
	const trimmed = message.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (trimmed.length <= MAX_INGEST_COMMENT_LENGTH) {
		return trimmed;
	}
	return (
		trimmed.slice(0, MAX_INGEST_COMMENT_LENGTH - TRUNCATION_MARKER.length) +
		TRUNCATION_MARKER
	);
}
