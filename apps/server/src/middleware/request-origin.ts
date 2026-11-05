const FORWARDED_PROTOCOLS = new Set(["http", "https"]);

/**
 * 本次请求的 origin：客户端访问 server 时使用的协议、主机和端口。
 * server 在 nginx 后面时，nginx 用 http 连接 server，协议取 nginx 写入的 X-Forwarded-Proto。
 * 这个值只用于生成返回给同一个客户端的地址，所以客户端伪造它只影响它自己。
 */
export function requestOriginOf(
	requestUrl: string,
	forwardedProto: string | undefined
): string {
	const url = new URL(requestUrl);
	const forwarded = forwardedProto?.split(",")[0]?.trim().toLowerCase();
	const protocol =
		forwarded !== undefined && FORWARDED_PROTOCOLS.has(forwarded)
			? `${forwarded}:`
			: url.protocol;
	return `${protocol}//${url.host}`;
}
