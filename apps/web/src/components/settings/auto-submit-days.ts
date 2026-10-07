import type {
	MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
} from "@automationstack/db/schema/project-settings";

export const MIN_AUTO_SUBMIT_DAYS: typeof MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS = 1;
export const MAX_AUTO_SUBMIT_DAYS: typeof MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS = 30;

const INTEGER_PATTERN = /^\d+$/;

export type AutoSubmitDaysResult =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; days: number };

export function validateAutoSubmitDays(raw: string): AutoSubmitDaysResult {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return { kind: "invalid", message: "请填写天数。" };
	}
	if (!INTEGER_PATTERN.test(trimmed)) {
		return { kind: "invalid", message: "天数必须是整数。" };
	}
	const days = Number(trimmed);
	if (days < MIN_AUTO_SUBMIT_DAYS || days > MAX_AUTO_SUBMIT_DAYS) {
		return {
			kind: "invalid",
			message: `天数需在 ${MIN_AUTO_SUBMIT_DAYS}–${MAX_AUTO_SUBMIT_DAYS} 之间。`,
		};
	}
	return { days, kind: "ok" };
}
