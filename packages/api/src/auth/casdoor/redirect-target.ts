/**
 * 登录完成后跳转的地址。只接受与前端（CORS_ORIGIN）同源的地址，防止开放重定向。
 * 可以是绝对地址或以 / 开头的路径。其他值都使用前端首页。
 */
export function safeRedirectTarget(
	requested: string | null | undefined,
	frontendOrigin: string
): string {
	const home = new URL("/", frontendOrigin).href;
	if (!requested) {
		return home;
	}
	const isPath = requested.startsWith("/") && !requested.startsWith("//");
	const isAbsolute = URL.canParse(requested);
	if (!(isPath || isAbsolute) || requested.includes("\\")) {
		return home;
	}
	const target = new URL(requested, frontendOrigin);
	return target.origin === new URL(frontendOrigin).origin ? target.href : home;
}
