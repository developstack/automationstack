export const CASE_UPLOADING_REF_SCHEME = "uploading:";

const CASE_UPLOADING_REF_EXACT =
	/^!\[\]\(uploading:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)$/;

const CASE_UPLOADING_REF_ANYWHERE =
	/!\[\]\(uploading:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\)/;

const CASE_UPLOADING_REF_ALL =
	/!\[\]\(uploading:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

/** 文字中所有上传中的占位的 token，按出现顺序排列。 */
export function listCaseUploadingTokens(text: string): string[] {
	const tokens: string[] = [];
	for (const [, token] of text.matchAll(CASE_UPLOADING_REF_ALL)) {
		if (token !== undefined) {
			tokens.push(token);
		}
	}
	return tokens;
}

export function hasCaseUploadingRef(text: string): boolean {
	return CASE_UPLOADING_REF_ANYWHERE.test(text);
}

export function buildCaseUploadingRef(token: string): string {
	return `![](${CASE_UPLOADING_REF_SCHEME}${token})`;
}

export function extractCaseUploadingToken(value: string): string | undefined {
	return CASE_UPLOADING_REF_EXACT.exec(value)?.[1];
}

export function replaceCaseImageRef(
	text: string,
	from: string,
	to: string
): string {
	const at = text.indexOf(from);
	if (at === -1) {
		return text;
	}
	return text.slice(0, at) + to + text.slice(at + from.length);
}
