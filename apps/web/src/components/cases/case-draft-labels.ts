import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { formatDateTime } from "@/components/cases/case-meta";

export const UNNAMED_CASE = "未命名用例";

export const UNKNOWN_TIME = "时间未知";

export function caseDraftTitle(draft: CaseDraft): string {
	const name = draft.values.name.trim();
	return name === "" ? UNNAMED_CASE : name;
}

export function caseDraftSavedLabel(draft: CaseDraft): string {
	return draft.savedAt === 0
		? UNKNOWN_TIME
		: formatDateTime(new Date(draft.savedAt));
}
