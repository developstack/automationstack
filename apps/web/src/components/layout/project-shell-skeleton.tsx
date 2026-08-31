import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { SecondaryPanelProvider } from "@automationstack/ui/components/secondary-panel-context";
import { Link, useParams } from "@tanstack/react-router";

import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectNameSkeleton } from "@/components/layout/project-name-skeleton";
import { ProjectShellHeader } from "@/components/layout/project-shell-header";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { readSecondaryPanelDefaultOpen } from "@/components/layout/sidebar-state";
import { useIsCaseSection } from "@/components/layout/use-case-section";
import { ModuleTreeSkeleton } from "@/components/skeletons/module-tree-skeleton";
import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";

/**
 * 项目名未知时二级面板的可访问名。
 *
 * title 不能省：窄屏下这块面板是 Dialog，缺了名字读屏只会念「对话框」。
 * 可见的那一份由 header 顶掉（一条骨架），这里只剩读屏用的字符串。
 */
const PANEL_FALLBACK_TITLE = "项目";

/** 顶栏骨架：面包屑照旧是真文字，只有项目名是灰条。 */
function ProjectHeaderSkeleton() {
	return (
		<ProjectShellHeader>
			<div className="flex min-w-0 items-center gap-2 text-sm">
				{/*
				 * 面包屑不做骨架：它是写死的文字，不等任何数据，
				 * 画成灰条反而让「项目」这个出口在加载期间凭空消失。
				 */}
				<nav aria-label="面包屑" className="flex items-center gap-2">
					<Link
						className="text-muted-foreground hover:underline"
						to="/projects"
					>
						项目
					</Link>
					<span aria-hidden="true" className="text-muted-foreground">
						/
					</span>
				</nav>
				<ProjectNameSkeleton />
			</div>
			{/*
			 * 右端的 presence 头像不占位：它本来就不是 loader 在等的东西，
			 * 而是 resolve 之后 websocket 连上才陆续出现的，
			 * 提前摆个骨架等于承诺一个这一帧根本兑现不了的位置。
			 */}
		</ProjectShellHeader>
	);
}

/** 内容区骨架：顶栏 + 一张用例表。 */
function ProjectBodySkeleton() {
	return (
		<div className="grid min-h-0 grid-rows-header-body">
			<ProjectHeaderSkeleton />
			{/* overflow-hidden：骨架比可视区高时按内容区自己的边界裁掉，不撑出整页滚动 */}
			<div className="min-h-0 min-w-0 overflow-hidden">
				{/* p-4 / gap-3 与 CaseListView 的 main 同款，内容到达时首行不位移 */}
				<div className="flex min-h-0 flex-col gap-3 p-4">
					{/* 左组不折行、右组 gap-2，与 case-list-skeleton.tsx 那份同款：
					    冷启动进项目时先显示这份父路由骨架、紧接着才轮到子路由那份，
					    两份宽度不同的话灰条会原地错动一次。 */}
					<ToolbarSkeleton endGap="gap-2" startWrap={false} />
					{/*
					 * 吃默认行数（= CASE_PAGE_SIZE），刻意与页面级那份
					 * case-list-skeleton.tsx 保持同值：冷启动进项目时先显示这份
					 * 父路由骨架、紧接着才轮到子路由那份，两份行数不同的话灰条会
					 * 原地跳一次——这正是本文件与那份「尺寸刻意保持一致」的约定。
					 * 20 行溢出可视区也不要紧：外层那道 overflow-hidden 会按内容区
					 * 边界裁掉，反而比 6 行下面留一大片空白更像一张真表。
					 */}
					<CaseTableSkeleton />
				</div>
			</div>
		</div>
	);
}

/**
 * /projects/$projectId 的 pending 态。
 *
 * 为什么非要有这一份：这条路由的 loader 会等 projects.get + modules.tree 两条查询，
 * 没有 pendingComponent 就会落到 router.tsx 的兜底整页 spinner 上——一级侧栏、顶栏、
 * 二级面板整块消失，而 defaultPendingMinMs 还保证它至少停留 300ms，看着像整个应用
 * 闪没了一次。外壳的骨架只由 __root 已经拿到的会话和路由参数里的 projectId 撑起来，
 * 让它留在原地，只把还没到的数据处画成骨架。
 *
 * 结构逐层对齐 ProjectShell + route.tsx 的 WorkspaceLayout，但不复用 ProjectShell：
 * 它要一个真实的 projectName——面板标题、窄屏抽屉的可访问名、侧栏切换器的按钮文案
 * 和 aria-label 全指着它，此刻一处都没有值，编一个假的比画骨架更糟。
 * 外壳本身（AppShell / ProjectSidebar / SecondaryPanel / ProjectShellHeader）仍是复用
 * 的同一批组件，不会跑出第二套侧栏、顶栏和面板尺寸。ProjectSidebar 这里不传
 * projectName，切换器那一行于是自动换成同高的骨架（几何在 project-sidebar.tsx 一处
 * 定义），名字到达时下面四条导航不会往下挪。
 *
 * 二级面板挂不挂，与就绪态共用同一个 useIsCaseSection：加载态与就绪态的任何差异
 * 都会在数据到达那一帧变成跳动，而「整整一列 16rem 凭空出现或消失」是其中最刺眼的
 * 一种。
 */
export function ProjectShellSkeleton() {
	const { projectId } = useParams({ from: "/projects/$projectId" });
	const showModulePanel = useIsCaseSection();
	return (
		<AppShell sidebar={<ProjectSidebar projectId={projectId} />}>
			<SecondaryPanelProvider defaultOpen={readSecondaryPanelDefaultOpen()}>
				{showModulePanel ? (
					<SecondaryPanel
						header={<ProjectNameSkeleton />}
						title={PANEL_FALLBACK_TITLE}
					>
						{/* 三行模块 + 那条「模块」小标题；aria-hidden（label 省掉）：
						    整块骨架只留 CaseTableSkeleton 自带的那一个播报区，
						    同一次加载播两遍读屏只会更吵。 */}
						<ModuleTreeSkeleton rows={3} title={true} />
					</SecondaryPanel>
				) : null}
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-1">
					<ProjectBodySkeleton />
				</div>
			</SecondaryPanelProvider>
		</AppShell>
	);
}
