import { SidebarHeader } from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import type { ReactNode } from "react";

/**
 * 侧栏顶部的一行，高 48px，内容垂直居中。
 * 上方间距是内容面板的 8px 外边距加 1px 边框，所以这一行与内容区的顶栏在同一条中线上。
 */
export function SidebarTopRow({ children }: { children: ReactNode }) {
	return (
		<SidebarHeader className="pt-sidebar-top">
			<SidebarMenu>
				<SidebarMenuItem className="flex h-12 items-center">
					{children}
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarHeader>
	);
}
