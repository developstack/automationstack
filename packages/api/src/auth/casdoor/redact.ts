const REDACTED = "***";

/** 错误详情的最大长度。超过时截断。 */
export const MAX_DETAIL_LENGTH = 300;

const MIN_SECRET_LENGTH_TO_REDACT = 4;

function variantsOf(secret: string): string[] {
	return [
		secret,
		encodeURIComponent(secret),
		new URLSearchParams({ s: secret }).toString().slice("s=".length),
	];
}

/** 从文本中删除密钥：原值、URL 编码和表单编码的形式都替换为 ***。 */
export function redactSecrets(
	text: string,
	secrets: readonly (string | null | undefined)[]
): string {
	let result = text;
	for (const secret of secrets) {
		if (!secret || secret.length < MIN_SECRET_LENGTH_TO_REDACT) {
			continue;
		}
		for (const variant of variantsOf(secret)) {
			result = result.split(variant).join(REDACTED);
		}
	}
	return result;
}

export function truncateDetail(
	text: string,
	max: number = MAX_DETAIL_LENGTH
): string {
	return text.length > max ? `${text.slice(0, max)}…（已截断）` : text;
}

function messageChain(error: unknown): string {
	if (!(error instanceof Error)) {
		return String(error);
	}
	const { cause } = error;
	if (cause instanceof Error && cause.message !== error.message) {
		return `${error.message}（${cause.message}）`;
	}
	return error.message;
}

/** 把错误转为可以写入日志和接口响应的文本：删除密钥，并截断。 */
export function describeError(
	error: unknown,
	secrets: readonly (string | null | undefined)[]
): string {
	return truncateDetail(redactSecrets(messageChain(error), secrets));
}
