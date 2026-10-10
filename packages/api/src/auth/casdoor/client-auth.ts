import type { ClientAuth } from "openid-client";

/**
 * Casdoor 的 HTTP Basic 认证头。凭据只放在请求头中，不放在 URL 中（D13）。
 * Casdoor v4.11 用 Go 的 r.BasicAuth() 读取原值，不做表单解码，所以这里也传原值。
 * openid-client 的 ClientSecretBasic 会先做表单编码：secret 中有特殊字符时与 Casdoor 不一致。
 */
export function casdoorBasicAuthorization(
	clientId: string,
	clientSecret: string
): string {
	const bytes = new TextEncoder().encode(`${clientId}:${clientSecret}`);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return `Basic ${btoa(binary)}`;
}

/** openid-client 的客户端认证：换取 token 时使用与管理 API 相同的 Basic 头。 */
export function casdoorClientAuth(clientSecret: string): ClientAuth {
	return (_server, client, _body, headers) => {
		headers.set(
			"authorization",
			casdoorBasicAuthorization(client.client_id, clientSecret)
		);
	};
}
