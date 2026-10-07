import { formatDateTime } from "@/components/cases/case-meta";

const MAX_TOKEN_NAME_LENGTH = 50;

export const TOKEN_NAME_HINT = `给自己看的备注，最多 ${MAX_TOKEN_NAME_LENGTH} 个字符，例如「CI 流水线」`;

export function validateTokenName(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return "备注名不能为空";
	}
	if (trimmed.length > MAX_TOKEN_NAME_LENGTH) {
		return `备注名最多 ${MAX_TOKEN_NAME_LENGTH} 个字符`;
	}
	return null;
}

export function formatLastUsedAt(value: Date | string | null): string {
	if (value === null) {
		return "从未使用";
	}
	return formatDateTime(value);
}

export function tokenStatusLabel(revokedAt: Date | string | null): string {
	return revokedAt === null ? "生效中" : "已吊销";
}
