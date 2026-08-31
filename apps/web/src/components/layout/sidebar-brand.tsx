/**
 * 一级侧栏顶部的品牌区。两条一级侧栏都在用：项目侧栏（project-sidebar.tsx）与
 * 平台侧栏（platform-sidebar.tsx）。单独成一份正是为了这个：两栏在同一次会话里
 * 来回换，品牌行的高度、内边距、收起态行为但凡差一点，换栏时顶部就会跳一下。
 *
 * ⚠️ 因此这一份服务**两个场景**：展开态那行品牌链接（指向 /projects）改一处即
 * 两栏同时生效，别在某一条侧栏里另写一份「自己的」品牌行——那正是这个文件当初
 * 被抽出来要避免的事。
 */
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

/**
 * 品牌名。眼下只有品牌区自己在用：项目列表页那份没有侧栏的裸壳顶栏曾经也引它
 * （plain-shell.tsx），那一页换成 AppShell + PlatformSidebar 之后裸壳整个删掉了，
 * 品牌名重新只有侧栏这一个落点。仍然导出成常量：两条一级侧栏（项目 / 平台）
 * 共用同一个 SidebarBrand，下一个引它的地方必须拿到同一个字符串，
 * 两处对不上就是两个应用。
 */
export const BRAND_NAME = "测试用例平台";

/**
 * 展开态的品牌行：左边是**指向项目列表的链接**，右边是那颗常驻的收起按钮。
 *
 * 标识这块不再是开关。整行可点、且只在悬停时才把 logo 换成方向图标，等于把
 * 「这里可以收起」藏进了必须先碰一下才看得见的状态里；拆出一颗独立的
 * SidebarTrigger 之后，入口静止时就摆在那儿，不必先猜。
 *
 * 腾出来的这块随后落到「回到项目列表」上——这是绝大多数产品里 logo 的默认含义，
 * 而本仓两条一级侧栏共用这一份（见文件头），所以一处改动同时给到平台侧栏与项目
 * 侧栏：在项目里点它 = 退回选项目那一步，在项目列表页点它 = 原地不动。
 *
 * 用 TanStack 的 `<Link>` 而不是 `<a href>`：后者是一次整页导航，会把路由缓存、
 * 已取到的 query 与侧栏折叠状态全部丢掉重来。
 *
 * 外形直接借 SidebarMenuButton（同一颗 cva 变体）而不是自己写 hover/焦点环：
 * 下面每一行导航都长这样，品牌行另写一套的话，同一列里就会出现两种悬停语言。
 * 不传 isActive：这不是导航项，停在 /projects 时给它一条选中竖条，会让人以为
 * 品牌区是第三个可选中的去处。
 *
 * size 显式写 icon 而不是省略：Button 的 icon 档现在本身就是 32px（见
 * packages/ui/src/components/button.tsx 顶部的台阶说明），与下面每一行导航
 * （sidebar-menu.tsx 的 h-8）等高，不必再拿更小的档去覆盖。留着这个 prop 只为
 * 让这颗按钮的档位在调用点上一眼可读——它旁边的 className 写着 size-8，
 * 两者说的是同一件事，谁也别单独改。
 */
function SidebarBrandRow() {
	return (
		// 收起态交给下面那颗品牌格：图标轨只有 32px 宽，塞不下第二个可点目标
		<div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
			{/*
			 * min-w-0 不能省：flex 子项的 min-width 默认是 auto，基类里那条
			 * [&>span:last-child]:truncate 在里面不生效。
			 * text-sm 盖掉基类的 text-xs：品牌名比导航项高一档，这是搬进链接之前
			 * 就有的字号，不该因为换了外壳而缩水。
			 */}
			<SidebarMenuButton
				className="min-w-0 flex-1 text-sm"
				render={<Link to="/projects" />}
			>
				{/* 尺寸与 shrink 由基类的 [&_svg]:size-4 [&_svg]:shrink-0 给 */}
				<FlaskConicalIcon aria-hidden="true" />
				<span className="font-medium">{BRAND_NAME}</span>
			</SidebarMenuButton>
			<SidebarTrigger className="size-8 shrink-0" size="icon" />
		</div>
	);
}

/**
 * 收起态（图标轨）的品牌格：格子本身就是展开开关。
 *
 * 轨里只有 32px，放不下「标识 + 按钮」两个目标，所以这一态仍旧沿用整格可点的做法。
 * 静止是 logo、悬停才换成方向图标：轨里没有文字可读，图标是唯一的落点，
 * 两枚常驻只会互相打架。
 */
function SidebarBrandToggle() {
	const { toggleSidebar } = useSidebar();
	return (
		<SidebarMenuButton
			// 轨里文字被原语藏了，可访问名只剩它；这一格只在收起态露面，文案不必随状态变
			aria-label="展开侧边栏"
			// hidden 打底、命中收起态才 flex：用显隐而不是条件渲染，收起动画补间到一半时
			// 节点若被整个换掉会闪一下，而宽度补间（transition-sidebar-offset / -gap）
			// 全程要求这棵子树不 remount
			className="group/logo hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
			onClick={toggleSidebar}
			size="lg"
			// 收起态才弹，展开态与窄屏抽屉由原语自己关掉
			tooltip={BRAND_NAME}
		>
			{/* 两枚图标叠在同一个格子里交叉淡入淡出，行内不会因为换图标而位移 */}
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
			{/* 这个 span 在轨里永远看不见，但删不得：原语藏的是「末位的 span」，
			    它一走，上面那枚图标就顶上末位、跟着被藏掉 */}
			<span className="truncate font-medium text-sm">{BRAND_NAME}</span>
		</SidebarMenuButton>
	);
}

/**
 * 品牌区。两种形态同时挂在树上，靠 CSS 显隐二选一。
 *
 * 窄屏抽屉走的是 SidebarDrawer 分支，外层没有 data-collapsible，
 * group-data-[collapsible=icon]:* 一族全不命中，于是抽屉里显示的是展开态那一行——
 * 里面那颗 SidebarTrigger 在窄屏切的是 openMobile，也就是关掉抽屉，
 * 正好补上 SheetContent 关掉的那颗关闭按钮。
 */
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
