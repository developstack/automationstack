import { formatDateTime } from "@/components/cases/case-meta";

/*
 * 这条规则是 packages/api/src/routers/api-tokens.ts 里 tokenNameSchema 的镜像
 * （`z.string().trim().min(1).max(50)`）。服务端校验失败只回一句笼统的
 * "Input validation failed"，看不出是空还是超长，所以同一套规则在输入时就说清楚。
 */
const MAX_TOKEN_NAME_LENGTH = 50;

export const TOKEN_NAME_HINT = `给自己看的备注，最多 ${MAX_TOKEN_NAME_LENGTH} 个字符，例如「CI 流水线」`;

/** 返回错误文案；通过校验时返回 null。 */
export function validateTokenName(value: string): string | null {
	// 服务端 schema 先 trim 再量长度，这里必须同序，否则两边的边界不一致
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return "备注名不能为空";
	}
	if (trimmed.length > MAX_TOKEN_NAME_LENGTH) {
		return `备注名最多 ${MAX_TOKEN_NAME_LENGTH} 个字符`;
	}
	return null;
}

/**
 * 「最后使用」这一格。
 *
 * 从没被用过时给一句明话而不是空白或「-」：这一列存在的意义是回答「这枚
 * token 还有人在用吗」，空白只会让人以为是没查到，而「从未使用」本身就是
 * 判断「能不能安全吊销」的依据。
 */
export function formatLastUsedAt(value: Date | string | null): string {
	if (value === null) {
		return "从未使用";
	}
	return formatDateTime(value);
}

/** 生效 / 已吊销；吊销是单向的，所以只有这两态。 */
export function tokenStatusLabel(revokedAt: Date | string | null): string {
	return revokedAt === null ? "生效中" : "已吊销";
}
