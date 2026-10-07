const SOURCE_REF_PATTERN = /\[([A-Z][A-Z0-9-]*)\]/;

export function extractSourceRef(title: string | undefined): string | null {
	if (typeof title !== "string") {
		return null;
	}
	const matched = SOURCE_REF_PATTERN.exec(title);
	return matched?.[1] ?? null;
}
