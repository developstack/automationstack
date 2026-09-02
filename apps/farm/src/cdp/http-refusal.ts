/**
 * 在 WebSocket 升级**之前**回一个普通 HTTP 错误。
 *
 * 从 `cdp/proxy.ts` 拆出来：那份文件到了 343 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这一段承载的是这条
 * 数据面最容易被写错的一条约束（`cdp/proxy.ts` 文件头第 2 条）：一旦握手完成，
 * 能表达的就只剩 WS close code，用户再也分不清是没权限还是没槽位。把「拒绝」
 * 单独放一个文件，是让这条约束有一个能被指着看的位置。
 */
import type { Duplex } from "node:stream";

export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_SERVICE_UNAVAILABLE = 503;
export const HTTP_BAD_GATEWAY = 502;

const STATUS_TEXT: Record<number, string> = {
	[HTTP_BAD_GATEWAY]: "Bad Gateway",
	[HTTP_BAD_REQUEST]: "Bad Request",
	[HTTP_FORBIDDEN]: "Forbidden",
	[HTTP_NOT_FOUND]: "Not Found",
	[HTTP_SERVICE_UNAVAILABLE]: "Service Unavailable",
	[HTTP_UNAUTHORIZED]: "Unauthorized",
};

interface RefuseOptions {
	extraHeaders?: Record<string, string>;
	message: string;
	socket: Duplex;
	status: number;
}

/**
 * 在升级之前回一个普通 HTTP 响应然后断开。
 *
 * 手写报文是因为这时候手上只有裸 socket——`http.ServerResponse` 已经不在这条路径
 * 上了（upgrade 事件的语义就是「这个请求 http 模块不管了」）。
 */
export function refuse(options: RefuseOptions): void {
	const body = JSON.stringify({ error: options.message });
	const headers: Record<string, string> = {
		connection: "close",
		"content-length": String(Buffer.byteLength(body)),
		"content-type": "application/json; charset=utf-8",
		...options.extraHeaders,
	};
	const head = Object.entries(headers)
		.map(([key, value]) => `${key}: ${value}`)
		.join("\r\n");
	const statusText = STATUS_TEXT[options.status] ?? "Error";
	options.socket.write(
		`HTTP/1.1 ${options.status} ${statusText}\r\n${head}\r\n\r\n${body}`
	);
	options.socket.destroy();
}
