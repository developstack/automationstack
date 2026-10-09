import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { SidebarFooter } from "@automationstack/ui/components/sidebar";
import { useSidebar } from "@automationstack/ui/components/sidebar-context";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { ChevronsUpDownIcon } from "lucide-react";

import { UserAvatar } from "@/components/layout/user-avatar";
import { useUserMenu } from "@/components/layout/user-menu";
import { UserMenuItems } from "@/components/layout/user-menu-items";

const ROLE_LABEL = { admin: "管理员", member: "成员" } as const;

interface UserMenuTriggerProps {
	role: keyof typeof ROLE_LABEL;
	username: string;
}

function UserMenuTrigger({ role, username }: UserMenuTriggerProps) {
	const { isCompact, state } = useSidebar();
	const collapsed = state === "collapsed" && !isCompact;
	return (
		<DropdownMenuTrigger
			render={
				<SidebarMenuButton
					aria-label={collapsed ? `账户菜单：${username}` : undefined}
					className="group-data-[collapsible=icon]:justify-center"
					size="lg"
				>
					<UserAvatar username={username} />
					<span className="flex min-w-0 flex-1 flex-col text-left">
						<span className="truncate font-medium">{username}</span>
						<span className="truncate text-sidebar-foreground/70">
							{ROLE_LABEL[role]}
						</span>
					</span>
					{collapsed ? null : <ChevronsUpDownIcon aria-hidden="true" />}
				</SidebarMenuButton>
			}
		/>
	);
}

export function SidebarUser() {
	const { isDark, logout, toggleTheme, user } = useUserMenu();

	return (
		<SidebarFooter>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
						<UserMenuTrigger role={user.role} username={user.username} />
						<DropdownMenuContent align="start" side="top">
							<UserMenuItems
								canChangePassword={user.authSource === "local"}
								isDark={isDark}
								onLogout={logout}
								onToggleTheme={toggleTheme}
								username={user.username}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarFooter>
	);
}
