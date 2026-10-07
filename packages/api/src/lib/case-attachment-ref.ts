export const CASE_ATTACHMENT_REF_SCHEME = "attachment:";

export const CASE_ATTACHMENT_REF_PATTERN =
	/!\[\]\(attachment:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

const CASE_ATTACHMENT_REF_EXACT =
	/^!\[\]\(attachment:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\)$/;

export function buildCaseAttachmentRef(attachmentId: string): string {
	return `![](${CASE_ATTACHMENT_REF_SCHEME}${attachmentId})`;
}

export function isCaseAttachmentRef(value: string): boolean {
	return CASE_ATTACHMENT_REF_EXACT.test(value);
}

export function extractCaseAttachmentIds(text: string): string[] {
	const ids: string[] = [];
	for (const [, id] of text.matchAll(CASE_ATTACHMENT_REF_PATTERN)) {
		if (id !== undefined) {
			ids.push(id);
		}
	}
	return ids;
}
