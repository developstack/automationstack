import { SECONDARY_PANEL_COOKIE } from "@automationstack/ui/components/secondary-panel-context";
import { SIDEBAR_COOKIE } from "@automationstack/ui/components/sidebar-context";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * 首帧的面板展开状态。
 *
 * 服务端读请求头、客户端读 document.cookie——同一个值，水合才不会不一致。
 * 存 cookie 而不是 localStorage 正是为了服务端也读得到：用 localStorage 的话
 * 首帧只能按默认值画，收起的人每次刷新都要看面板闪出来再收回去。
 *
 * `createIsomorphicFn` 的 server 分支会被 vite 插件从浏览器产物里整段删掉。
 */
const cookieHeader = createIsomorphicFn()
	.client(() => document.cookie)
	.server(() => getRequestHeader("cookie") ?? "");

/** 按 cookie 名读一个面板的展开状态：一级侧边栏与二级面板各记各的。 */
export function readPanelDefaultOpen(cookieName: string): boolean {
	for (const part of cookieHeader().split(";")) {
		const [name, value] = part.split("=");
		if (name?.trim() === cookieName) {
			return value?.trim() !== "false";
		}
	}
	// 没写过 cookie 的新用户默认展开：先让人看见有哪些东西，再让他自己收起
	return true;
}

export function readSidebarDefaultOpen(): boolean {
	return readPanelDefaultOpen(SIDEBAR_COOKIE);
}

export function readSecondaryPanelDefaultOpen(): boolean {
	return readPanelDefaultOpen(SECONDARY_PANEL_COOKIE);
}
