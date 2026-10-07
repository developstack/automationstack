import { SidebarInset } from "@automationstack/ui/components/sidebar";
import { SidebarProvider } from "@automationstack/ui/components/sidebar-context";
import type { ReactNode } from "react";

import { readSidebarDefaultOpen } from "@/components/layout/sidebar-state";

interface AppShellProps {
	children: ReactNode;
	sidebar: ReactNode;
}

export function AppShell({ children, sidebar }: AppShellProps) {
	return (
		<SidebarProvider defaultOpen={readSidebarDefaultOpen()}>
			{sidebar}
			<SidebarInset className="h-svh">{children}</SidebarInset>
		</SidebarProvider>
	);
}
