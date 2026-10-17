import { SidebarMenuButton } from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { FlaskConicalIcon } from "lucide-react";

import { SidebarExpandButton } from "@/components/layout/sidebar-expand-button";
import { SidebarTopRow } from "@/components/layout/sidebar-top-row";

export const BRAND_NAME = "测试用例平台";

function SidebarBrandRow() {
	return (
		<SidebarMenuButton
			className="text-sm group-data-[collapsible=icon]:hidden"
			render={<Link to="/projects" />}
		>
			<FlaskConicalIcon aria-hidden="true" />
			<span className="font-medium">{BRAND_NAME}</span>
		</SidebarMenuButton>
	);
}

export function SidebarBrand() {
	return (
		<SidebarTopRow>
			<SidebarBrandRow />
			<SidebarExpandButton
				label={BRAND_NAME}
				mark={<FlaskConicalIcon aria-hidden="true" />}
			/>
		</SidebarTopRow>
	);
}
