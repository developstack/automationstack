import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { SecondaryPanelProvider } from "@automationstack/ui/components/secondary-panel-context";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { Link } from "@tanstack/react-router";

import { CaseTableSkeleton } from "@/components/cases/case-table-states";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectShellHeader } from "@/components/layout/project-shell";
import { readSecondaryPanelDefaultOpen } from "@/components/layout/sidebar-state";

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
 * 项目概览、测试评审和执行 →「模块」标题行 → 模块行。
 * 标题行 = Button size="icon-xs" 的 24px（h-6），里面的 h2 只有 16px，不决定行高；
 * 其余每行 = px-2 py-0.5（2+2）+ icon-xs 24px = 28px（h-7）；
 * 容器沿用真实树的 aside p-2（8px）+ gap-1（4px）。
 * 核对（按 3 条模块行算，共 6 行 5 道 gap）：
 * 8 + 28×5 + 24 + 4×5 + 8 = 200px，两边相等。
 *
 * 「未完成草稿」那一行不进骨架：它只在本机存着草稿时才存在，而这份骨架是
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
			{/* 项目概览、测试评审和执行：模块分组之外的两个项目级去处 */}
			<Skeleton className="h-7 w-full" />
			<Skeleton className="h-7 w-full" />
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
 * 两个使用点的就绪态并不同高：顶栏（route.tsx 的 WorkspaceHeader）那处是 text-sm
 * 的 h1，行高 20px，与这条 h-5 严丝合缝；二级面板的 header 槽那处就绪后换成
 * ProjectSwitcher 的 Button（不传 size = h-8 = 32px），比这条高出 12px。
 * 差这 12px 也不跳：两处的行高都由 min-h-12 的 48px 兜着——顶栏是 min-h-12 + py-1
 * + border-b（4 + 32 + 4 + 1 = 41px，仍够不到 48px），面板标题行是 min-h-12 且无 py
 * 无边框，两边都稳定在 48px；20px 与 32px 的内容都进得去，items-center 只让它们
 * 各自上下居中，换人时边框与下方内容一格不动。
 * 所以 h-5 不为面板那处改成 h-8：那只会让顶栏那处的骨架比真实文字高出一档。
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

/**
 * /projects/$projectId 的 pending 态。
 *
 * 为什么非要有这一份：这条路由的 loader 会等 projects.get + modules.tree 两条查询，
 * 没有 pendingComponent 就会落到 router.tsx 的兜底整页 spinner 上——一级侧栏、顶栏、
 * 二级面板整块消失，而 defaultPendingMinMs 还保证它至少停留 300ms，看着像整个应用
 * 闪没了一次。外壳本来就与这两条查询无关（侧栏只依赖 __root 已经拿到的会话），
 * 让它留在原地，只把还没到的数据处画成骨架。
 *
 * 结构逐层对齐 ProjectShell + route.tsx 的 WorkspaceLayout，但不复用 ProjectShell：
 * 它内部的 ModulePanel 要一个真实的 projectName——那既是 SecondaryPanel 的可访问名，
 * 又是项目切换器的按钮文案和 aria-label，此刻这三处都还没有值，编一个假的比画骨架更糟。
 * 外壳本身（AppShell / SecondaryPanel / ProjectShellHeader）仍是复用的同一批原语，
 * 不会跑出第二套顶栏和面板尺寸。
 */
export function ProjectShellSkeleton() {
	return (
		<AppShell>
			<SecondaryPanelProvider defaultOpen={readSecondaryPanelDefaultOpen()}>
				<SecondaryPanel
					header={<ProjectNameSkeleton />}
					title={PANEL_FALLBACK_TITLE}
				>
					<ModuleTreeSkeleton />
				</SecondaryPanel>
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-1">
					<div className="grid min-h-0 grid-rows-header-body">
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
						{/* overflow-hidden：骨架比可视区高时按内容区自己的边界裁掉，不撑出整页滚动 */}
						<div className="min-h-0 min-w-0 overflow-hidden">
							{/* p-4 / gap-3 与 CaseListView 的 main 同款，内容到达时首行不位移 */}
							<div className="flex min-h-0 flex-col gap-3 p-4">
								<CaseToolbarSkeleton />
								<CaseTableSkeleton />
							</div>
						</div>
					</div>
				</div>
			</SecondaryPanelProvider>
		</AppShell>
	);
}
