import {
	Sidebar,
	SidebarContent,
	SidebarRail,
} from "@automationstack/ui/components/sidebar";

import { GlobalNavGroup } from "@/components/layout/global-nav-group";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarUser } from "@/components/layout/sidebar-user";

/**
 * 全局作用域的一级侧栏：品牌 + 全局导航 + 用户区。
 *
 * 只承担「在哪几个一级去处之间走动」这一件事，所以整个组件不需要 projectId。
 * 项目内部的导航已经另有一套（project-sidebar.tsx），那一套是项目作用域的；
 * 这一套只剩 /members、/ai-provider、/api-tokens、/settings 四个顶级路由在用。
 */
export function AppSidebar() {
	return (
		// collapsible 用默认的 "icon"：收起后缩成图标轨，而不是整块滑出屏幕
		<Sidebar>
			<SidebarBrand />
			<SidebarContent>
				<GlobalNavGroup />
			</SidebarContent>
			<SidebarUser />
			{/* 面板右缘的细条：鼠标已经在侧边栏这一侧时，比回到品牌行更近 */}
			<SidebarRail />
		</Sidebar>
	);
}
