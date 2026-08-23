/**
 * 实时协作身份。
 *
 * 「谁」由登录会话决定：用户名和颜色都从服务端来（WS 握手时按会话 cookie 推导，
 * 见 apps/server/src/realtime/ws.ts），前端不再存昵称、也没有协作昵称这个概念。
 * 这里只剩下「哪个标签页」——它与身份无关，纯粹是本地状态。
 */

const CLIENT_ID_STORAGE_KEY = "realtime:client-id";

/** 当前生效的协作身份：用户名 + 按用户名派生的颜色。 */
export interface RealtimeProfile {
	color: string;
	name: string;
}

/**
 * 每 Tab 唯一的 clientId：sessionStorage 持久（刷新不变），
 * SSR 环境返回一次性 id（不会被持久化，浏览器端会重新取）。
 */
export function getClientId(): string {
	if (typeof window === "undefined") {
		return crypto.randomUUID();
	}
	const existing = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
	if (existing) {
		return existing;
	}
	const clientId = crypto.randomUUID();
	window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
	return clientId;
}
