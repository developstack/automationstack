import type { Project } from "@automationstack/db/schema/projects";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { SidebarMenuButton } from "@automationstack/ui/components/sidebar-menu";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronsUpDownIcon, FolderKanbanIcon } from "lucide-react";

import { orpc } from "@/utils/orpc";

/**
 * 触发器：侧栏里的一行，形态与其它侧栏行同档。
 *
 * 用 SidebarMenuButton 而不是自己搭一个 Button：这一行的行高（h-8）、内边距
 * （px-2）、悬停底色、圆角都得跟上下的品牌行与四条导航行逐像素对齐，而那些数
 * 全在这个原语里。它此前住在二级面板的标题行（px-4 的语境），靠一串负外边距
 * 把自己掰回模块树那条 16px 的 gutter 上；搬进侧栏之后那套折算连同它的推导一起
 * 作废了——现在的对齐是原语自带的。
 *
 * 前导图标不是装饰：侧栏里每一行的文字都落在「p-2 容器 + px-2 行 + 16px 图标 +
 * gap-2」= 40px 上（品牌行、四条导航行都如此），少一枚图标这行字就会缩到 16px，
 * 在一列左对齐的文字里独自往左突出一截。图标取 FolderKanban，与菜单里「查看全部
 * 项目」那一条同款——它们说的是同一件事：项目。
 *
 * 名字用 font-medium：它是「当前作用域」，比底下那四个去处高一层；而 data-active
 * 的加粗只落在导航行上，两者不会撞。
 * min-w-0 flex-1 才截得断：flex 子项默认 min-width:auto，名字一长会把右端的箭头
 * 顶出按钮外。truncate 也得自己写——原语只给「最后一个 span」加 truncate，
 * 而这一行的末位是那枚箭头 svg。
 */
function ProjectSwitcherTrigger({ projectName }: { projectName: string }) {
	return (
		<DropdownMenuTrigger
			render={
				// 光念项目名说不清这是个按钮，名字里要带上「按下去会发生什么」
				<SidebarMenuButton aria-label={`切换项目：当前是 ${projectName}`}>
					<FolderKanbanIcon aria-hidden="true" />
					<span className="min-w-0 flex-1 truncate font-medium">
						{projectName}
					</span>
					<ChevronsUpDownIcon aria-hidden="true" />
				</SidebarMenuButton>
			}
		/>
	);
}

/**
 * 列表没到、拿不到或为空时菜单里的那一条。
 *
 * 不能什么都不渲染：点开一个空菜单看着像功能坏了，而这三种情形都只是「暂时没内容」。
 * 这里的 disabled 是名副其实的——它本来就不是一个去处，读屏念「不可用」不冤枉。
 */
function ProjectSwitcherPlaceholder({ label }: { label: string }) {
	return <DropdownMenuItem disabled>{label}</DropdownMenuItem>;
}

interface ProjectSwitcherItemProps {
	isCurrent: boolean;
	project: Project;
}

function ProjectSwitcherItem({ isCurrent, project }: ProjectSwitcherItemProps) {
	if (isCurrent) {
		/*
		 * 当前项目不渲染成链接：点自己只是原地重跳一次。也刻意不加 disabled——
		 * 读屏会把它念成「不可用」，听着像坏了，而它其实是「你已经在这儿了」；
		 * 保持可聚焦、由 aria-current 播报当前态，右侧的对勾是同一件事的视觉版本。
		 */
		return (
			<DropdownMenuItem aria-current="true">
				<span className="min-w-0 flex-1 truncate">{project.name}</span>
				<CheckIcon aria-hidden="true" />
			</DropdownMenuItem>
		);
	}
	return (
		<DropdownMenuItem
			render={
				/*
				 * 落在概览而不是用例列表，与项目列表页的卡片同一个落点（理由见
				 * components/projects/project-list.tsx）。
				 *
				 * 顺带解决了旧写法要 clearModuleSelection 的那件事：URL 里的
				 * moduleId / caseId 属于上一个项目，原样带过去会指向新项目里根本不
				 * 存在的模块，落地就是一片「加载不出来」。概览页没有 search 参数，
				 * Link 不指定 search 时也不会把当前这份带过去，那些参数自己就掉了。
				 */
				<Link
					params={{ projectId: project.id }}
					to="/projects/$projectId/overview"
				/>
			}
		>
			<span className="min-w-0 flex-1 truncate">{project.name}</span>
		</DropdownMenuItem>
	);
}

/**
 * 项目列表。
 *
 * 用 useQuery 而不是 useSuspenseQuery：这一行是侧栏的常驻 chrome，四周没有任何
 * Suspense 边界，挂起会一路冒泡到根布局、把整个外壳变白。
 * 菜单只在展开时才挂载，所以这个请求也只在真要切项目时才发。
 */
function ProjectSwitcherItems({
	currentProjectId,
}: {
	currentProjectId: string;
}) {
	const projectsQuery = useQuery(orpc.projects.list.queryOptions());
	if (projectsQuery.isPending) {
		return <ProjectSwitcherPlaceholder label="加载中…" />;
	}
	if (projectsQuery.isError) {
		return <ProjectSwitcherPlaceholder label="项目列表加载失败" />;
	}
	const projects = projectsQuery.data ?? [];
	if (projects.length === 0) {
		return <ProjectSwitcherPlaceholder label="暂无项目" />;
	}
	return projects.map((project) => (
		<ProjectSwitcherItem
			isCurrent={project.id === currentProjectId}
			key={project.id}
			project={project}
		/>
	));
}

interface ProjectSwitcherProps {
	projectId: string;
	projectName: string;
}

/**
 * 项目侧栏里的项目切换器：显示当前项目，点开换一个。
 *
 * 住在一级侧栏而不是二级面板：侧栏本身就是项目作用域的，切换器换掉的正是这个
 * 作用域；留在面板里则意味着它的可见性跟着一块与它无关的模块树走——面板只在
 * 用例管理这一段挂出来（判据见 layout/case-section-path.ts），概览与测试任务页
 * 会连带失去换项目的能力。
 *
 * 顶栏面包屑的「项目」是另一条路，但那是先退回列表页再进去，中间隔着一整页。
 */
export function ProjectSwitcher({
	projectId,
	projectName,
}: ProjectSwitcherProps) {
	return (
		<DropdownMenu>
			<ProjectSwitcherTrigger projectName={projectName} />
			<DropdownMenuContent align="start">
				<ProjectSwitcherItems currentProjectId={projectId} />
				<DropdownMenuSeparator />
				{/*
				 * 「我要换个项目」时才发现要找的项目得先建 / 得先改名，出口就该在同一个菜单里，
				 * 不必先关掉菜单再去顶栏面包屑上找。
				 */}
				<DropdownMenuItem render={<Link to="/projects" />}>
					<FolderKanbanIcon aria-hidden="true" />
					查看全部项目
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
