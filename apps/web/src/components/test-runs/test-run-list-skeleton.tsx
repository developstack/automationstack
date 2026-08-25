import { Skeleton } from "@automationstack/ui/components/skeleton";

const SKELETON_ROW_KEYS = ["r1", "r2", "r3", "r4", "r5"] as const;

/**
 * 列表首屏骨架，高度按真实表格逐行折算（折算依据同
 * `cases/case-table-states.tsx`：表头 TableHead h-10 + TableHeader 的 1px
 * 下边框；数据行 TableCell p-2 16px + Badge h-5 20px = h-9，再加 1px 边框）。
 * 对不齐的话，数据到达那一帧下方的内容会上下跳一下。
 *
 * 只有表格这一段：TestRunListView 在自己的工具栏与说明文字**下方**用它填表格位
 * （改筛选后重新取数时），那时工具栏已经在屏幕上了，这里再摆一条就成了两条。
 * 路由 pendingComponent 那种「整块 main 都还没有」的场合请用
 * TestRunListPageSkeleton。
 */
export function TestRunListSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="测试任务列表加载中"
			className="flex flex-col"
		>
			<Skeleton className="mb-px h-10 w-full rounded-none" />
			{SKELETON_ROW_KEYS.map((key) => (
				<Skeleton className="mt-px h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}

/**
 * 工具栏骨架，约定与 cases/case-list-skeleton.tsx 的 CaseListToolbarSkeleton 同源：
 * 工具栏是 main 这列 flex 的第一行，省掉它表格骨架就顶到最上面。
 *
 * 折算（真实类名 → 骨架高度，逐个控件核过，不取约数）：
 *   搜索框    Input 的 h-8（input.tsx）                  = 32px → h-8，w-64 同宽
 *   状态筛选  SelectTrigger 的 data-[size=default]:h-8   = 32px → h-8
 *   计数      text-xs 16px，在 items-center 的行里不撑高 = 不单独占位，并进 w-24
 *   新建按钮  Button size=default 的 h-8（button.tsx）   = 32px → h-8
 * 全排 h-8，行高 32px，与就绪态那一行严丝合缝。
 *
 * 左右分组照搬就绪态的 justify-between（左 gap-2 / 右 gap-3 也一并照抄），
 * 灰条宽度与真实控件差一点只是横向差异，不构成跳动，不去逐个描宽。
 *
 * aria-hidden：整块骨架的播报只留 TestRunListSkeleton 自带的那一个 output，
 * 同一次加载播两遍读屏只会更吵。
 */
function TestRunListToolbarSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="flex flex-wrap items-center justify-between gap-2"
		>
			<div className="flex flex-wrap items-center gap-2">
				{/* w-64 与真实搜索框（Input className="w-64"）同宽 */}
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-8 w-28" />
			</div>
			<div className="flex items-center gap-3">
				<Skeleton className="h-8 w-24" />
				<Skeleton className="h-8 w-28" />
			</div>
		</div>
	);
}

/**
 * 表头上方那段「已完成 ≠ 全通过」说明文字的占位。
 *
 * text-xs 的行高是 16px（Tailwind v4 默认 calc(1/0.75)，本仓库 theme.css 没有
 * 覆盖 --text-xs，index.css 末尾那档「等价于 text-xs」写的也是 line-height: 1rem），
 * 所以一行 = h-4。
 *
 * ⚠️ 这里只能摆一行，做不到恒等：那段文字是 66 个全角字符，12px 字号下约 795px，
 * 内容区宽于它时是一行、窄于它时折成两行，而内容区宽度取决于视口与二级面板开合。
 * 取一行是取常见档（1440px 视口、侧栏 256px、p-4 32px，内容区 ≈ 1130px，不折行）；
 * 窄屏下真身折成两行时这里仍差 16px——但那是原本 72px 落差里剩下的最后一行，
 * 比整块不占位好得多。真要恒等只能把这段文案提成共享常量、骨架直接渲染真文字，
 * 那要改 test-run-list-view.tsx，不在本轮范围内。
 */
function TestRunListNoteSkeleton() {
	return <Skeleton aria-hidden="true" className="h-4 w-full" />;
}

/**
 * 整块 main 的加载态：工具栏 + 说明文字 + 表格，与 TestRunListView 就绪态的
 * 三个直接子节点一一对应。
 *
 * 为什么非补前两块不可（TEST_RUN_LIST_MAIN 是 flex-col gap-3，gap = 12px）：
 *   工具栏 32px + gap 12px + 说明 16px + gap 12px = 72px
 * 只画表格的话，数据到达那一帧整张表要往上跳这 72px；而 router.tsx 的
 * PENDING_MIN_MS = 300 保证骨架至少停 300ms，这一跳一定看得见。
 *
 * 不含 main / PageTransition：那一层由路由的 pendingComponent 给出，与就绪态
 * 共用同一份 TEST_RUN_LIST_MAIN，这里只负责 main 里面的东西。
 */
export function TestRunListPageSkeleton() {
	return (
		<>
			<TestRunListToolbarSkeleton />
			<TestRunListNoteSkeleton />
			<TestRunListSkeleton />
		</>
	);
}
