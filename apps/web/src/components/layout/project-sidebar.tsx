import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarRail,
} from "@automationstack/ui/components/sidebar";
import {
	SidebarMenu,
	SidebarMenuItem,
} from "@automationstack/ui/components/sidebar-menu";
import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ProjectNavGroup } from "@/components/layout/project-nav-group";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarUser } from "@/components/layout/sidebar-user";

interface ProjectSwitcherRowProps {
	projectId: string;
	projectName: string | undefined;
}

/**
 * 切换器那一行。自成一组，排在四条导航行之上。
 *
 * 分组而不是并进导航组：那四项是项目**内部**的去处，切换器换掉的是整个作用域，
 * 两者不是同一层。SidebarContent 的 gap-2（8px）正好把两组分开，组内是 gap-1
 * （4px）——「组间距 = 2× 组内间距」，边界靠间距就读得出来，不必再画分隔线
 * （这条约定见 packages/ui/src/components/sidebar-menu.tsx 顶部）。
 *
 * 收起态（图标轨）整行藏掉：轨里只有 32px，一行「图标 + 项目名 + 箭头」进去
 * 不是被压扁就是被裁一半，而这一行没有「只留图标」的降级形态可言——图标是
 * FolderKanban，轨里单独一枚看不出它说的是「当前项目」还是「项目列表」。
 * 收起态下没有切换入口，展开即可，这是明知的取舍。
 * 用 CSS 显隐而不是条件渲染，理由与品牌区那两行一字不差（sidebar-brand.tsx）：
 * 收起是一段宽度补间，补间期间这棵子树若被整个换掉会闪一下。
 * hidden 是 display:none，被藏起来的这一组不参与 flex 布局，轨里也不会留下
 * 一道 8px 的空 gap。
 *
 * 窄屏抽屉走的是另一条分支：那一层外壳上没有 data-collapsible，
 * group-data-[collapsible=icon]:* 一族全不命中，于是抽屉里这一行照常显示——
 * 与品牌区在抽屉里显示展开态那一行是同一个机制。
 */
function ProjectSwitcherRow({
	projectId,
	projectName,
}: ProjectSwitcherRowProps) {
	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarMenu>
				<SidebarMenuItem>
					{projectName === undefined ? (
						/*
						 * 项目名还在路上（父路由 loader 未回）。h-8 w-full 就是
						 * SidebarMenuButton 默认档的整块，灰条与真实行逐像素同框，
						 * 名字到达时下面四行不会往下挪。
						 */
						<Skeleton aria-hidden="true" className="h-8 w-full" />
					) : (
						<ProjectSwitcher projectId={projectId} projectName={projectName} />
					)}
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}

interface ProjectSidebarProps {
	projectId: string;
	/**
	 * 当前项目名。加载态（project-shell-skeleton.tsx）给不出这个值，
	 * 那一行于是换成同高的骨架——两种形态的几何由本文件一处给出，
	 * 调用方各写一份迟早会差出一行。
	 */
	projectName?: string;
}

/**
 * 项目作用域的一级侧栏：品牌 + 当前项目（可切换）+ 项目内导航 + 用户区。
 *
 * 与全局侧栏（app-sidebar.tsx）逐层同构，只多出切换器那一行、并换掉中间那一组
 * 导航——两者会在「项目列表 → 进项目」这条路径上来回换，品牌行与用户区但凡不是
 * 同一份，换栏时上下两端就会各跳一次。
 *
 * 用户区（登出、切主题）留在这里：进了项目之后这仍是全站唯一的账户出口。
 */
export function ProjectSidebar({
	projectId,
	projectName,
}: ProjectSidebarProps) {
	return (
		// collapsible 用默认的 "icon"：收起后缩成图标轨，而不是整块滑出屏幕
		<Sidebar>
			<SidebarBrand />
			<SidebarContent>
				<ProjectSwitcherRow projectId={projectId} projectName={projectName} />
				<ProjectNavGroup projectId={projectId} />
			</SidebarContent>
			<SidebarUser />
			{/* 面板右缘的细条：鼠标已经在侧边栏这一侧时，比回到品牌行更近 */}
			<SidebarRail />
		</Sidebar>
	);
}
