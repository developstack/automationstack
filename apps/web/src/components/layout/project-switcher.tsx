import type { Project } from "@automationstack/db/schema/projects";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronsUpDownIcon, FolderKanbanIcon } from "lucide-react";

import { clearModuleSelection } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

/**
 * 触发器。
 *
 * 下面所有坐标都从面板内容区的左右缘量起（secondary-panel-surface 的 border-r 在
 * width 之内，标题行与模块树共用同一个内容盒，那 1px 对两列是同一份偏移，可以约掉）；
 * 右缘记作 W。
 *
 * -mx-2.25 px-2 一起看：标题行是 px-4，Button 自带 px-2.5，base class 还有一圈
 * 1px 的透明边框（border border-transparent bg-clip-padding），不管的话项目名会落在
 * 16+1+10 = 27px 上，而底下模块树的每一行内容都在 16px（见 module-tree.tsx 的 gutter
 * 约定），同一列里差着 11px 的两条竖线比没有 hover 底色更扎眼。
 * px-2 先把按钮内边距压到 8px，-mx-2.25 再把它整块外扩 9px —— 8px 抵消标题行 px-4
 * 与模块树 aside p-2 的档位差，多出来的 1px 抵消那圈透明边框：内容盒回到 [16, W−16]，
 * 文字落在 16px；底色被 bg-clip-padding 裁在 padding box [8, W−8]，
 * 与模块行（aside p-2）的高亮块逐像素同宽。
 * 只写 -mx-2.75（不压 px）也能把文字摆到 16px，但底色会内缩 6px，
 * 同一列里两种高亮块差 2px。
 *
 * 宽度不能写 w-full：它就是 width:100%，对 flex 子项解析成标题行 *内容盒* 的宽度
 * （W−32），而负外边距只平移、不撑宽，按钮右缘会停在 W−24——左边齐了右边短 18px，
 * 箭头跟着偏左。要的是「margin box 与标题行内容盒等宽」，两种形态各自达成：
 * lg 及以上标题行是 flex 行，靠 flex-1 —— basis 为 0，剩余空间是容器宽度减掉
 * 「基准尺寸 + 外边距」算出来的，负的那 18px 会被加回来；lg 以下换成抽屉，
 * 头是 SheetHeader 的 flex-col，宽度落在交叉轴上，align-self 默认的 stretch
 * 本来就按同一个式子算，此时反倒不能再给宽度类——给了就成了定尺寸，stretch 失效，
 * 退回上面那个短 18px 的毛病。断点写 lg 是因为抽屉与流内列的切换本来就压在
 * 1024px 这条线上（见 secondary-panel.tsx）。
 * 也没有无条件写 flex-1：在 flex-col 的抽屉头里 basis 0 会作用到高度上，
 * 把 36px 的触发器撑满标题行的 48px——那是另一处不相干的改动。
 *
 * 项目名 min-w-0 flex-1 才截得断：flex 子项默认 min-width:auto，名字一长
 * 会把右端的箭头顶出按钮外。
 *
 * 箭头上的 me-1 是对齐侧栏右侧那条竖线，不是随手加的间距。
 * 底下每一枚尾部控件都是 size="icon-xs"，即 24px 的方按钮里放 12px 的图标
 * （button.tsx 的 icon-xs 把 svg 压到 size-3）；图标居中、透明边框两侧对称，
 * 中心不受边框影响，于是「＋」「⋯」「脑图」三枚图标的中心一律落在 W−28。
 * 而这里的箭头是直接贴着按钮内边距的裸图标，尺寸走默认的 size-4（16px），
 * 内容盒右缘既然在 W−16，裸放的话中心就在 W−24 —— 比那条竖线偏右 4px。
 * 差 4px 恰恰是最难看的一档：远了像两栏，近了才像没对齐。
 * me-1 把它左推 4px，中心回到 W−28。
 *
 * 不用 pe-3 去顶：tailwind-merge 的冲突表里 px 只和 pl/pr 互斥，不含 ps/pe，
 * 基类的 px-2.5 不会被消掉，两条 padding 同时出现、谁赢取决于 Tailwind 的
 * 出栈顺序——能work但是靠巧合。给图标加 margin 没有任何覆盖关系，改了就是改了。
 * 也没有把箭头包进一个 size-6 的槽位里去跟对面逐格对齐：那要多一层 DOM，
 * 而标题行本来就比树行高一档（min-h-12 对 py-0.5），槽位对不出额外的信息。
 */
function ProjectSwitcherTrigger({ projectName }: { projectName: string }) {
	return (
		<DropdownMenuTrigger
			render={
				// 光念项目名说不清这是个按钮，名字里要带上「按下去会发生什么」
				<Button
					aria-label={`切换项目：当前是 ${projectName}`}
					className="-mx-2.25 px-2 text-sm lg:flex-1"
					variant="ghost"
				>
					<span className="min-w-0 flex-1 truncate text-left">
						{projectName}
					</span>
					<ChevronsUpDownIcon aria-hidden="true" className="me-1" />
				</Button>
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
				 * search 走 clearModuleSelection：URL 里的 moduleId / caseId 属于上一个项目，
				 * 原样带过去会指向新项目里根本不存在的模块，落地就是一片「加载不出来」。
				 */
				<Link
					params={{ projectId: project.id }}
					search={clearModuleSelection}
					to="/projects/$projectId"
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
 * 用 useQuery 而不是 useSuspenseQuery：这块头是面板的常驻 chrome，
 * 挂起会把整块二级面板变白（module-panel.tsx 那层 Suspense 是给模块树准备的）。
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
 * 二级面板标题行里的项目切换器。
 *
 * 面板顶上本来就写着当前项目名，「换一个项目」这件事从这行字上点开最近；
 * 一级侧栏的「项目管理」是另一条路，但那是先退回列表页再进去，中间隔着一整页。
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
				 * 不必先关掉菜单再去一级侧栏找入口。
				 */}
				<DropdownMenuItem render={<Link to="/projects" />}>
					<FolderKanbanIcon aria-hidden="true" />
					查看全部项目
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
