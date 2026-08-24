/**
 * 测试任务状态徽标。列表、详情、报告三处必须渲染同一枚，理由同
 * `case-status-badge.tsx`：同一个测试任务在不同视图里长得不一样会让人以为看错了行。
 *
 * 五态一律用同一个 outline 外框，**靠形状而不是靠填充色分级**：
 * 前四态是一颗圆点（进度轴上的一格），已提交换成一把锁（不在那条轴上）。
 * 这样在灰度打印、色觉障碍、以及「徽标只有 20px 高」的表格行里都读得出来。
 */
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import { Badge } from "@automationstack/ui/components/badge";
import { cn } from "@automationstack/ui/lib/utils";
import { LockIcon } from "lucide-react";

import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";

/**
 * 圆点颜色只表达「推进到哪一步」。
 *
 * `completed` 刻意是中性的 `bg-foreground` 而不是绿色：**已完成 ≠ 全部通过**
 * （plan §2.4）。一个 120 条里挂了 40 条的测试任务同样是「已完成」，
 * 给它一枚绿点等于在列表页上撒谎。通过率在同一行右边单独占一列，
 * 那才是回答「过没过」的地方。
 */
const STATUS_DOT_CLASSES: Record<
	Exclude<TestRunStatus, "submitted">,
	string
> = {
	completed: "bg-foreground",
	in_progress: "bg-primary",
	pending_review: "border border-muted-foreground",
	ready: "bg-muted-foreground/50",
};

export function TestRunStatusBadge({ status }: { status: TestRunStatus }) {
	if (status === "submitted") {
		return (
			<Badge variant="outline">
				<LockIcon aria-hidden="true" data-icon="inline-start" />
				{RUN_STATUS_LABELS.submitted}
			</Badge>
		);
	}

	return (
		<Badge variant="outline">
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					STATUS_DOT_CLASSES[status]
				)}
			/>
			{RUN_STATUS_LABELS[status]}
		</Badge>
	);
}
