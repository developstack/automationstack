/**
 * 「会话没了」这件事在两个地方被发现，却只该有一个出口。
 *
 * 发现点一：任意受保护过程回 UNAUTHORIZED——会话到期（`SESSION_TTL_DAYS` 是 7 天
 * 且没有滑动续期，所以每个长期使用的人早晚会撞上）、在另一个标签页登出、账号被
 * 管理员停用，都长这个样子。
 * 发现点二：`auth.me` 自己不报错，未登录时安静地回 null；窗口重新聚焦触发的
 * refetch 就是这么把 null 塞回缓存的，一次网络错误都不会发生。
 *
 * 出口只有一个：跳登录页并带上回跳地址。那件事要 router，而建 queryClient 的
 * `utils/orpc.ts` 里拿不到 router——router 是**用**那个 queryClient 建起来的
 * （`router.tsx` import 了 `orpc.ts`），反过来 import 就是一个环。所以这里只放
 * 一个模块级的回调槽：根布局挂载时把「怎么跳」注册进来，两个发现点都只管喊一声。
 * 不用 `window.location.href = "/login"` 硬刷：那会把 SPA 导航整个打断，还得自己
 * 拼 redirect 参数，而 router.navigate 连回跳地址带类型一起给了。
 */

import { ORPCError } from "@orpc/client";

/**
 * 服务端「没登录」一律是这个码（`api/src/index.ts` 的 requireUser、
 * `api/src/lib/project-scope.ts`），与「登录了但不够格」的 FORBIDDEN 分开：
 * 后者跳登录页毫无意义，换个账号也不会变得有权限。
 */
export function isUnauthorizedError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "UNAUTHORIZED";
}

export const LOGIN_PATHNAME = "/login";

/**
 * 登录页的判断有三处要用（根闸门、根外壳、失效跳转），写死三份字符串迟早漂移；
 * 路由器给出的 pathname 可能带尾斜杠，两种写法指的是同一个页面。
 */
export function isLoginPathname(pathname: string): boolean {
	return pathname === LOGIN_PATHNAME || pathname === `${LOGIN_PATHNAME}/`;
}

type SessionExpiredHandler = () => void;

let handleSessionExpired: SessionExpiredHandler | null = null;
let redirecting = false;

/** 根布局挂载时注册、卸载时传 null 摘掉。 */
export function setSessionExpiredHandler(
	handler: SessionExpiredHandler | null
): void {
	handleSessionExpired = handler;
}

/**
 * 会话已失效，请把人送去登录页。
 *
 * 一次失效通常同时打翻一整屏查询（列表、详情、侧栏各一条），每条都会喊到这里；
 * `redirecting` 把它们收敛成一次导航，否则会连着推进好几条历史记录。
 *
 * 没人接的时候**不置位**：服务端渲染时根布局的 effect 不跑，回调是空的，而模块
 * 级状态在 Node 里是跨请求共享的——在那儿置上一次，后面所有请求就再也跳不动了。
 */
export function notifySessionExpired(): void {
	if (redirecting || handleSessionExpired === null) {
		return;
	}
	redirecting = true;
	handleSessionExpired();
}

/** 会话重新可用（重新登录成功）后复位，让下一次失效仍然跳得动。 */
export function resetSessionExpiredNotice(): void {
	redirecting = false;
}
