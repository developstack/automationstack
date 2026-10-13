import { SidebarTrigger } from "@automationstack/ui/components/sidebar";
import type { ReactNode } from "react";

interface AppHeaderProps {
	children?: ReactNode;
}

export function AppHeader({ children }: AppHeaderProps) {
	return (
		<header className="sticky top-0 z-30 flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card/95 px-4 py-1 backdrop-blur">
			<SidebarTrigger className="lg:hidden" />
			{children}
		</header>
	);
}
