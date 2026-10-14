/** 网络中断或服务不可达时的原因。 */
export const NETWORK_FAILURE_REASON = "网络异常或服务暂时不可用，请稍后重试";

const UNKNOWN_REASON = NETWORK_FAILURE_REASON;

// fetch 在断网、跨域失败或服务不可达时抛出的 TypeError，各浏览器的文字不同
const NETWORK_ERROR_PATTERN =
	/^(?:Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|Network request failed)$/;

/** fetch 因断网、跨域失败或服务不可达而失败。 */
export function isNetworkFailure(error: unknown): boolean {
	return (
		error instanceof Error && NETWORK_ERROR_PATTERN.test(error.message.trim())
	);
}

function reasonOf(error: unknown): string {
	if (!(error instanceof Error)) {
		return UNKNOWN_REASON;
	}
	const message = error.message.trim();
	if (message === "" || NETWORK_ERROR_PATTERN.test(message)) {
		return UNKNOWN_REASON;
	}
	return message;
}

/**
 * 操作失败时的提示文字。action 是操作名，例如「删除项目」。
 */
export function failureMessage(
	action: string | undefined,
	error: unknown
): string {
	const reason = reasonOf(error);
	return action === undefined ? reason : `${action}失败：${reason}`;
}
