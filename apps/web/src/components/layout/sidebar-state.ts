import { SECONDARY_PANEL_COOKIE } from "@automationstack/ui/components/secondary-panel-context";
import { SIDEBAR_COOKIE } from "@automationstack/ui/components/sidebar-context";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

const cookieHeader = createIsomorphicFn()
	.client(() => document.cookie)
	.server(() => getRequestHeader("cookie") ?? "");

export function readPanelDefaultOpen(cookieName: string): boolean {
	for (const part of cookieHeader().split(";")) {
		const [name, value] = part.split("=");
		if (name?.trim() === cookieName) {
			return value?.trim() !== "false";
		}
	}
	return true;
}

export function readSidebarDefaultOpen(): boolean {
	return readPanelDefaultOpen(SIDEBAR_COOKIE);
}

export function readSecondaryPanelDefaultOpen(): boolean {
	return readPanelDefaultOpen(SECONDARY_PANEL_COOKIE);
}
