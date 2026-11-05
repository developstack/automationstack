import { isIP } from "node:net";

interface ClientIpSources {
	/** CLIENT_IP_HEADER 请求头的值。没有设置 CLIENT_IP_HEADER，或请求中没有这个头时为 undefined。 */
	headerValue: string | undefined;
	/** TCP 连接的对端地址。 */
	socketAddress: string | undefined;
}

/**
 * 请求的客户端 IP。登录限流按它计数。
 *
 * server 在反向代理后面时，TCP 连接的对端总是代理，所以所有用户的地址相同。
 * 这时代理把客户端地址写进请求头（CLIENT_IP_HEADER），本函数使用它。
 *
 * 请求头有多个地址时（X-Forwarded-For 的格式），使用最后一个：它由最近的代理写入。
 * 前面的地址来自客户端，可以伪造。
 * 请求头中的地址无效或不存在时，使用 TCP 连接的地址。
 */
export function resolveClientIp({
	headerValue,
	socketAddress,
}: ClientIpSources): string | null {
	const forwarded = headerValue?.split(",").at(-1)?.trim();
	if (forwarded !== undefined && isIP(forwarded) !== 0) {
		return forwarded;
	}
	return socketAddress ?? null;
}
