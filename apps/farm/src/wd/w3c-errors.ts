/**
 * WebDriver 这一侧的错误体与状态码。
 *
 * 从 `wd/proxy.ts` 拆出来：那份文件到了 406 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这些常量与两个成品
 * 响应是**协议规定的形状**，不是这台 farm 的逻辑：拼错一个字符串客户端就识别不出
 * 重试语义，所以它们值得单独放一处、一眼能看全，而不是散在编排代码的缝里。
 */

/** W3C 规定的两个错误码，拼错了客户端就识别不出重试语义。 */
export const ERROR_SESSION_NOT_CREATED = "session not created";
const ERROR_INVALID_SESSION_ID = "invalid session id";

export const HTTP_OK = 200 as const;
/** W3C 把绝大多数错误都压在 500 上，`session not created` 也是（§ Errors）。 */
export const HTTP_INTERNAL = 500 as const;
const HTTP_NOT_FOUND = 404 as const;
export const HTTP_SERVICE_UNAVAILABLE = 503 as const;

/** W3C 错误体。`stacktrace` 是必填字段，给不出就给空串（客户端会读它）。 */
export function w3cError(
	error: string,
	message: string
): {
	value: { error: string; message: string; stacktrace: string };
} {
	return { value: { error, message, stacktrace: "" } };
}

/** `session not created` 的成品响应。这条路径上的失败十有八九长这样。 */
export function sessionNotCreated(message: string): Response {
	return Response.json(w3cError(ERROR_SESSION_NOT_CREATED, message), {
		status: HTTP_INTERNAL,
	});
}

export function notFoundSession(sessionId: string): Response {
	return Response.json(
		w3cError(
			ERROR_INVALID_SESSION_ID,
			`会话 ${sessionId} 不存在或已结束（可能已超时、被杀，或从未属于这台 farm）`
		),
		{ status: HTTP_NOT_FOUND }
	);
}
