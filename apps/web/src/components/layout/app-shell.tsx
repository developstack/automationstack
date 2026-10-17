import { SidebarInset } from "@automationstack/ui/components/sidebar";
import { SidebarProvider } from "@automationstack/ui/components/sidebar-context";
import type { ReactNode } from "react";

import { readSidebarDefaultOpen } from "@/components/layout/sidebar-state";

interface AppShellProps {
	children: ReactNode;
	sidebar: ReactNode;
}

/** 宽屏下内容区是带圆角和阴影的卡片面板，上、右、下三边露出侧栏的底色。窄屏下面板占满屏幕。 */
export function AppShell({ children, sidebar }: AppShellProps) {
	return (
		<SidebarProvider defaultOpen={readSidebarDefaultOpen()}>
			{sidebar}
			<SidebarInset className="h-svh bg-sidebar lg:py-2 lg:pr-2">
				<div
					className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-card lg:rounded-lg lg:border lg:shadow-card"
					data-slot="content-panel"
				>
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
