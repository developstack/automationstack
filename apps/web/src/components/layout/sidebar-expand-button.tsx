import { useSidebar } from "@automationstack/ui/components/sidebar-context";
import { SidebarMenuButton } from "@automationstack/ui/components/sidebar-menu";
import { PanelLeftOpenIcon } from "lucide-react";
import type { ReactNode } from "react";

interface SidebarExpandButtonProps {
	label: string;
	mark: ReactNode;
}

/** 侧栏收起时顶部的按钮：显示标识，悬停时换成展开图标，点击展开侧栏。 */
export function SidebarExpandButton({ label, mark }: SidebarExpandButtonProps) {
	const { toggleSidebar } = useSidebar();
	return (
		<SidebarMenuButton
			aria-label="展开侧边栏"
			className="group/logo hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
			onClick={toggleSidebar}
			size="lg"
			tooltip={label}
		>
			<span className="relative flex shrink-0 items-center justify-center">
				<span className="flex transition-opacity ease-emphasized group-hover/logo:opacity-0">
					{mark}
				</span>
				<PanelLeftOpenIcon
					aria-hidden="true"
					className="absolute opacity-0 transition-opacity ease-emphasized group-hover/logo:opacity-100"
				/>
			</span>
			<span className="truncate font-medium text-sm">{label}</span>
		</SidebarMenuButton>
	);
}
