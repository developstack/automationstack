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

/**
 * 收起态只留一枚居中的头像。
 *
 * 图标轨只有 3rem，名字和角色两行文字进去必然被截成一两个字，留着反而像是坏了；
 * 首字母头像本身已经够认人。文字那一段不是自己删掉而是交给原语藏——
 * 原语靠「最后一个 span」认文字标签，真删了就轮到头像当最后一个 span，
 * 连头像一起消失。ChevronsUpDown 是 svg、原语不管，必须自己按状态摘掉：
 * 它留在 DOM 里也会把文字那一段挤出「最后一个 span」的位置。
 * 收起判断要连 isCompact 一起看：窄屏抽屉用的是另一份展开状态，
 * 只看 state 会让抽屉里也只剩头像。
 */
function UserMenuTrigger({ role, username }: UserMenuTriggerProps) {
	const { isCompact, state } = useSidebar();
	const collapsed = state === "collapsed" && !isCompact;
	return (
		<DropdownMenuTrigger
			render={
				<SidebarMenuButton
					// 收起态没有可读的文字，可访问名只能显式给
					aria-label={collapsed ? `账户菜单：${username}` : undefined}
					// 图标轨里整行被压成 32px 见方且 padding 归零，不居中头像会偏左 2px
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

/**
 * 侧边栏底部的用户区。
 *
 * 直接显示用户名——协作昵称已随本次登录改造一并去掉，界面上出现的名字
 * 与登录用的用户名、以及用例上留下的署名，从此是同一个东西。
 */
export function SidebarUser() {
	const { isDark, logout, toggleTheme, user } = useUserMenu();

	return (
		<SidebarFooter>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
						<UserMenuTrigger role={user.role} username={user.username} />
						{/* side=top：菜单在贴底的触发器上方展开，不然会顶到视口外 */}
						<DropdownMenuContent align="start" side="top">
							<UserMenuItems
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
