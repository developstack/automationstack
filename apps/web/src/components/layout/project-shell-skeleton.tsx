import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { SecondaryPanelProvider } from "@automationstack/ui/components/secondary-panel-context";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { Link, useParams } from "@tanstack/react-router";

import { CaseTableSkeleton } from "@/components/cases/case-table-states";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectShellHeader } from "@/components/layout/project-shell";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { readSecondaryPanelDefaultOpen } from "@/components/layout/sidebar-state";
import { useIsCaseSection } from "@/components/layout/use-case-section";

/**
 * 项目名未知时二级面板的可访问名。
 *
 * title 不能省：窄屏下这块面板是 Dialog，缺了名字读屏只会念「对话框」。
 * 可见的那一份由 header 顶掉（一条骨架），这里只剩读屏用的字符串。
 */
const PANEL_FALLBACK_TITLE = "项目";

/** 模块行骨架的稳定 key：条数固定，用下标当 key 会被 lint 拦下。 */
const MODULE_ROW_KEYS = ["first", "second", "third"];

/**
 * 侧栏骨架。行序与高度逐条折算自 module-tree.tsx 的真实行：
 * 「模块」标题行 → 模块行。
 * 标题行 = Button size="icon-xs" 的 24px（h-6），里面的 h2 只有 16px，不决定行高；
 * 模块行 = px-2 py-0.5（2+2）+ icon-xs 24px = 28px（h-7）；
 * 容器沿用真实树的 aside p-2（8px）+ gap-1（4px）。
 * 核对（按 3 条模块行算，共 4 行 3 道 gap）：
 * 8 + 24 + 28×3 + 4×3 + 8 = 136px，两边相等。
 *
 * 「项目概览」「测试评审和执行」两行已经不在这份骨架里：它们升级成一级侧栏的
 * 菜单项之后，二级面板里只剩用例相关的内容（见 module-tree.tsx）。
 *
 * 「未完成草稿」那一行同样不进骨架：它只在本机存着草稿时才存在，而这份骨架是
 * 服务端也要渲染的，猜它在等于让首帧多出一行、随后又凭空消失。
 *
 * 行数只能猜——真实条数正是还没拿到的那份数据。猜多猜少都只影响这一列自己的尾部：
 * 二级面板独立滚动，它长短几像素不会把顶栏和内容区顶得上下跳。
 *
 * aria-hidden 而不是再来一个 output：整块骨架只留 CaseTableSkeleton 自带的那一个
 * 播报区，同一次加载播两遍读屏只会更吵。
 */
function ModuleTreeSkeleton() {
	return (
		<div aria-hidden="true" className="flex flex-col gap-1 p-2">
			{/* 标题行是「模块」两个字 + 右端两颗图标按钮，整行大半是空的，骨架也别拉满宽 */}
			<Skeleton className="h-6 w-16" />
			{MODULE_ROW_KEYS.map((key) => (
				<Skeleton className="h-7 w-full" key={key} />
			))}
		</div>
	);
}

/**
 * 顶栏与二级面板标题行里代替项目名的那条。
 *
 * 两个使用点的就绪态现在同高，都是 20px，所以两处共用这一条 h-5：顶栏
 * （route.tsx 的 WorkspaceHeader）那处是 text-sm 的 h1；二级面板那处自切换器搬走
 * 之后退回原语的纯文本标题（`span.text-sm`，同为 20px，见 secondary-panel.tsx）。
 * 两处的行高又都由 min-h-12 的 48px 兜着——顶栏是 min-h-12 + py-1 + border-b
 * （4 + 32 + 4 + 1 = 41px，仍够不到 48px），面板标题行是 min-h-12 且无 py 无边框，
 * 灰条换成真文字时边框与下方内容一格不动。
 * 不写「加载中…」之类的占位文字：它会在项目名到达时被整段换掉，宽度跟着跳一次。
 */
function ProjectNameSkeleton() {
	return <Skeleton className="h-5 w-32" />;
}

/**
 * 用例列表工具栏的骨架。
 *
 * 同一条工具栏里的控件一律 32px（约定见 case-filters.tsx 顶部），所以这排一律 h-8：
 * 真实 32px vs 骨架 32px，底下隔着 gap-3 的表格不会上下挪。
 * 左右分组也照搬：左边筛选、右边计数与操作，justify-between 把它们推到两端。
 */
function CaseToolbarSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="flex flex-wrap items-center justify-between gap-2"
		>
			<div className="flex items-center gap-2">
				{/* w-64 与真实搜索框（Input className="w-64"）同宽 */}
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-8 w-28" />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-8 w-24" />
				<Skeleton className="h-8 w-28" />
			</div>
		</div>
	);
}

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
					<CaseToolbarSkeleton />
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
						<ModuleTreeSkeleton />
					</SecondaryPanel>
				) : null}
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-1">
					<ProjectBodySkeleton />
				</div>
			</SecondaryPanelProvider>
		</AppShell>
	);
}
