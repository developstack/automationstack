/**
 * 平台一级侧栏的「镜像库」一项。
 * 它挂不挂由 platform-sidebar.tsx 的 PlatformNavGroup 按平台角色决定。
 */
import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Link } from "@tanstack/react-router";
import { LayersIcon } from "lucide-react";

/**
 * 镜像库（docker 后端的镜像目录）。
 *
 * 名字从「浏览器」改成「镜像库」是模型转向的一部分（plan §12）：现在**节点是
 * 主体**，一台机器上有哪些浏览器由它自己探出来上报（见 /nodes 页的能力清单），
 * 这张表退回它本来的位置——docker 后端要拉哪个镜像时查的那本目录。仍叫「浏览器」
 * 的话，两处都在回答「有哪些浏览器」，而它们给的答案可以不一样（目录里登记了
 * chromium 140，某台机器上并没有拉过那个镜像）。
 *
 * 路由路径仍是 /browsers，没跟着改：改路径会作废所有已发出去的链接与书签，
 * 而它换来的只是地址栏里的一个词——这一层的名字由界面上的文字负责说清楚。
 *
 * **按平台角色隐藏**，与「用户」那一项同规（那份文件里有一整段在讲为什么它藏、
 * 而项目内的「成员」不藏）。这一页对非管理员能画出来的全部内容就是一张「需要
 * 管理员权限」的空态——给这样一页留人人可见的入口，等于在导航里摆一扇必然撞墙
 * 的门。
 *
 * 藏入口不等于权限：地址栏拦不住任何人，farm-browsers-page.tsx 里那张 forbidden
 * 空态是必须留的兜底，真正拦人的是服务端的 adminProcedure。
 *
 * 图标取 LayersIcon（层叠）：镜像就是一层层叠起来的，而隔壁「节点」占着
 * HardDriveIcon（一台机器）——两项的差别正是「机器」与「机器要拉的东西」。
 * 原先的 AppWindowIcon（一个窗口）跟着旧名字一起退场：那个隐喻画的是「一个浏览器
 * 窗口」，而这一页现在一个窗口也不管。按前缀判活动态，理由同「用户」那一项：
 * 这一支目前没有更深的子页面，将来长出来了前缀写法也仍然对。
 */
export function FarmBrowsersNavItem({ pathname }: { pathname: string }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				aria-label="镜像库"
				isActive={pathname.startsWith("/browsers")}
				render={<Link to="/browsers" />}
				tooltip="镜像库"
			>
				<LayersIcon aria-hidden="true" />
				<span>镜像库</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}
