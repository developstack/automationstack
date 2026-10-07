const PERCENT = 100;

export const RATE_UNKNOWN = "—";

const NEAR_FULL_PERCENT = 99;
const NEAR_ZERO_PERCENT = 1;

export function formatRate(rate: number | null): string {
	if (rate === null) {
		return RATE_UNKNOWN;
	}
	const percent = rate * PERCENT;
	const rounded = Math.round(percent);
	if (rounded === PERCENT && percent < PERCENT) {
		return `${NEAR_FULL_PERCENT}%`;
	}
	if (rounded === 0 && percent > 0) {
		return `${NEAR_ZERO_PERCENT}%`;
	}
	return `${rounded}%`;
}

export function formatShare(count: number, total: number): string {
	if (total === 0) {
		return "0%";
	}
	return formatRate(count / total);
}
