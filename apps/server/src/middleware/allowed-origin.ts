/** 本机地址。开发环境中，这些主机名的任何端口都可以跨域访问。 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

interface OriginPolicy {
	/** 前端地址（CORS_ORIGIN）。 */
	corsOrigin: string;
	nodeEnv: "development" | "production" | "test";
}

function isLocalOrigin(origin: string): boolean {
	try {
		return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
	} catch {
		return false;
	}
}

/**
 * 请求的 origin 可以跨域访问。
 * 前端地址（CORS_ORIGIN）总是可以。开发环境中，本机的任何端口也可以，
 * 因此前端换了端口不用改 CORS_ORIGIN。
 */
export function isAllowedOrigin(origin: string, policy: OriginPolicy): boolean {
	if (origin === policy.corsOrigin) {
		return true;
	}
	return policy.nodeEnv === "development" && isLocalOrigin(origin);
}
