import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { FlaskConicalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BRAND_NAME } from "@/components/layout/sidebar-brand";
import {
	UserAvatar,
	UserMenuItems,
	useUserMenu,
} from "@/components/layout/user-menu";

/**
 * 没有侧栏的外壳：顶栏 + 自己滚动的主内容。
 *
 * 项目列表页用它。侧栏（AppShell 那一层）装的是「在某个作用域内部走动」的导航，
 * 而选项目这一步还没有作用域可言——那时侧栏里能放的只有它自己那一项，
 * 一条只指向当前页的导航既占掉 16rem，又让人以为还有别处可去。
 *
 * h-svh + flex-col 是照 AppShell 那份（SidebarProvider + SidebarInset）折算出来的
 * 等价形态：外壳撑满视口，内容区自己 overflow-y-auto，sticky 的顶栏才粘得住。
 * 不撑满的话内容一长就变成整页滚动，顶栏会跟着被推出视野。
 * bg-background 也要显式给：那层底色原本由 SidebarInset 提供，这里没有它了。
 */
export function PlainShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-svh min-h-0 w-full min-w-0 flex-col bg-background">
			{children}
		</div>
	);
}

/**
 * 裸壳顶栏右端的账户入口。
 *
 * 没有侧栏就没有 SidebarUser，而登出、切主题、当前用户全在那颗菜单里——不补
 * 这一处，这一页会变成「登进来就出不去」。菜单项复用 user-menu.tsx 的同一份
 * （UserMenuItems + useUserMenu），只换触发器：侧栏底部那颗是「头像 + 用户名 +
 * 角色」的整行，顶栏只有一行高度，摆得下的只有头像。
 *
 * 触发器用 size="icon"（32px）套 size-7（28px）的头像：与顶栏里其它图标按钮
 * （SidebarTrigger、SecondaryPanelTrigger）同一档，顶栏 min-h-12 的推导不受影响
 * （那笔账见 app-shell.tsx 的 AppHeader）。
 */
function PlainShellUserMenu() {
	const { isDark, logout, toggleTheme, user } = useUserMenu();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					// 顶栏里这颗按钮没有可读文字，可访问名只能显式给
					<Button
						aria-label={`账户菜单：${user.username}`}
						size="icon"
						variant="ghost"
					>
						<UserAvatar username={user.username} />
					</Button>
				}
			/>
			{/* align=end：触发器贴着顶栏右端，菜单向左展开才不会溢出视口 */}
			<DropdownMenuContent align="end">
				<UserMenuItems
					isDark={isDark}
					onLogout={logout}
					onToggleTheme={toggleTheme}
					username={user.username}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * 裸壳顶栏：左边品牌、右边账户，中间留给调用方。
 *
 * 外观（sticky、min-h-12、px-4、py-1、下边框、backdrop-blur）逐项照抄
 * AppHeader，理由与那边一字不差（推导见 app-shell.tsx）；这里没法直接复用它，
 * 是因为 AppHeader 里那颗 SidebarTrigger 要读侧栏 context，而这一层压根没有
 * SidebarProvider。两处的顶栏尺寸必须保持同档：从项目列表点进项目就是这两种
 * 顶栏的直接切换，差一点点高度就是可见的跳动。
 *
 * 品牌名与图标取自侧栏的品牌区（sidebar-brand.tsx），同一个常量：这一页没有
 * 侧栏，顶栏这一处就是「这是哪个应用」的唯一落点，两处对不上就是两个应用。
 */
export function PlainShellHeader({ children }: { children?: ReactNode }) {
	return (
		<header className="sticky top-0 z-30 flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/95 px-4 py-1 backdrop-blur">
			{/* min-w-0：品牌名要能截断，flex 子项的 min-width 默认是 auto */}
			<div className="flex min-w-0 items-center gap-2">
				<FlaskConicalIcon aria-hidden="true" className="size-4 shrink-0" />
				<span className="truncate font-medium text-sm">{BRAND_NAME}</span>
			</div>
			{children}
			{/* ml-auto 把账户推到右端，中间那段 children 仍然靠左 */}
			<div className="ml-auto flex items-center">
				<PlainShellUserMenu />
			</div>
		</header>
	);
}
