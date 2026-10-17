import { SidebarTrigger } from "@automationstack/ui/components/sidebar";
import type { ReactNode } from "react";

interface AppHeaderProps {
	children?: ReactNode;
}

/** 外框顶部的一行：小号路径和全局状态，没有分隔线。大标题和操作按钮在各页面的 PageHeader 中。 */
export function AppHeader({ children }: AppHeaderProps) {
	return (
		<header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-muted-foreground text-xs">
			<SidebarTrigger className="-ml-2" />
			{children}
		</header>
	);
}
