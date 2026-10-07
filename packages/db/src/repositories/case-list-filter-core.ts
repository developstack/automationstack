const LIKE_SPECIAL_CHARS = /[%_\\]/g;

export function escapeLikePattern(value: string): string {
	return value.replace(LIKE_SPECIAL_CHARS, "\\$&");
}

export function containsPattern(keyword: string): string {
	return `%${escapeLikePattern(keyword)}%`;
}

export function prefixPattern(prefix: string): string {
	return `${escapeLikePattern(prefix)}%`;
}
