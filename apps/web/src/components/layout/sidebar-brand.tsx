import {
	SidebarHeader,
	SidebarTrigger,
} from "@automationstack/ui/components/sidebar";
import { useSidebar } from "@automationstack/ui/components/sidebar-context";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { FlaskConicalIcon, PanelLeftOpenIcon } from "lucide-react";

export const BRAND_NAME = "测试用例平台";

function SidebarBrandRow() {
	return (
		<div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
			<SidebarMenuButton
				className="min-w-0 flex-1 text-sm"
				render={<Link to="/projects" />}
			>
				<FlaskConicalIcon aria-hidden="true" />
				<span className="font-medium">{BRAND_NAME}</span>
			</SidebarMenuButton>
			<SidebarTrigger className="size-8 shrink-0" size="icon" />
		</div>
	);
}

function SidebarBrandToggle() {
	const { toggleSidebar } = useSidebar();
	return (
		<SidebarMenuButton
			aria-label="展开侧边栏"
			className="group/logo hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
			onClick={toggleSidebar}
			size="lg"
			tooltip={BRAND_NAME}
		>
			<span className="relative flex size-4 shrink-0 items-center justify-center">
				<FlaskConicalIcon
					aria-hidden="true"
					className="transition-opacity ease-emphasized group-hover/logo:opacity-0"
				/>
				<PanelLeftOpenIcon
					aria-hidden="true"
					className="absolute opacity-0 transition-opacity ease-emphasized group-hover/logo:opacity-100"
				/>
			</span>
			<span className="truncate font-medium text-sm">{BRAND_NAME}</span>
		</SidebarMenuButton>
	);
}

export function SidebarBrand() {
	return (
		<SidebarHeader>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarBrandRow />
					<SidebarBrandToggle />
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarHeader>
	);
}
