/**
 * 列表页工具栏骨架的唯一实现。
 *
 * 合并前有三份：用例列表页（cases/case-list-skeleton.tsx）、项目外壳 pending
 * 态（layout/project-shell-skeleton.tsx，与前者逐字相同）、测试任务列表页
 * （test-runs/test-run-list-skeleton.tsx，只差左组能不能折行与右组的 gap）。
 *
 * 为什么这一条非摆不可：工具栏是 main 这列 flex 的第一行，省掉它下面的表格
 * 骨架就顶到最上面，数据到达时整张表要连着工具栏与 gap 一起往下挪。
 * 同一条工具栏里的控件一律 32px（约定见 case-filters.tsx 顶部），所以这排
 * 一律 h-8：真实 32px vs 骨架 32px，底下的表格不会上下跳。
 *
 * 灰条宽度与真实控件对不齐只会横向差一点，不构成跳动，所以不去逐个控件描宽。
 * aria-hidden 而不是再来一个 output：整块骨架的播报只留表格骨架自带的那一个。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

export interface ToolbarSkeletonProps {
	/** 右侧分组的间距类，各自照抄就绪态：用例列表 gap-2，测试任务列表 gap-3。 */
	endGap: string;
	/** 左侧分组允不允许折行；测试任务列表的就绪态是 flex-wrap。 */
	startWrap: boolean;
}

export function ToolbarSkeleton({ endGap, startWrap }: ToolbarSkeletonProps) {
	return (
		<div
			aria-hidden="true"
			className="flex flex-wrap items-center justify-between gap-2"
		>
			<div className={cn("flex items-center gap-2", startWrap && "flex-wrap")}>
				{/* w-64 与真实搜索框（Input className="w-64"）同宽 */}
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-8 w-28" />
			</div>
			<div className={cn("flex items-center", endGap)}>
				<Skeleton className="h-8 w-24" />
				<Skeleton className="h-8 w-28" />
			</div>
		</div>
	);
}
