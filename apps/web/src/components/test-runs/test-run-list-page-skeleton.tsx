import { Skeleton } from "@automationstack/ui/components/skeleton";

import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";
import { TestRunListSkeleton } from "@/components/test-runs/test-run-list-skeleton";

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
			{/* 右组 gap-3、左组允许折行，两者都照抄就绪态那一行 */}
			<ToolbarSkeleton endGap="gap-3" startWrap={true} />
			<TestRunListNoteSkeleton />
			<TestRunListSkeleton />
		</>
	);
}
