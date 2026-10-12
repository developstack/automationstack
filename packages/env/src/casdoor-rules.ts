// Casdoor 配置的校验规则。环境变量（server.ts）和认证设置接口共用这些规则。

/** webhook 共享密钥至少 32 个字符（plan 021 §3）。 */
export const CASDOOR_WEBHOOK_SECRET_MIN_LENGTH = 32;

/**
 * 项目管理员角色名的默认值（#15）。环境变量 CASDOOR_PROJECT_ADMIN_ROLE 可以替换它。
 * auth_settings.project_admin_role 列的默认值也是它。
 */
export const DEFAULT_CASDOOR_PROJECT_ADMIN_ROLE =
	"automationstack-project-admin";

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * 把「只有协议、主机和端口」的地址规范为 origin（不带结尾的斜杠）。
 * 地址带路径、查询、片段或用户信息，或者不是 http(s) 时，返回 null。
 * Casdoor 的公网地址和集群内地址都用这个规则（plan 021 D11）。
 */
export function parseOriginUrl(value: string): string | null {
	if (!URL.canParse(value)) {
		return null;
	}
	const url = new URL(value);
	const originOnly =
		HTTP_PROTOCOLS.has(url.protocol) &&
		url.pathname === "/" &&
		url.search === "" &&
		url.hash === "" &&
		url.username === "" &&
		url.password === "";
	return originOnly ? url.origin : null;
}
