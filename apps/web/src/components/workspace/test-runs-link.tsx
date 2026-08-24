import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ClipboardListIcon } from "lucide-react";

/**
 * 侧栏第 2 行：测试评审和执行。
 *
 * 排在「模块」这一组**上面**、紧跟「项目概览」：用例库是「有哪些用例」，
 * 测试任务是「这一轮在测什么」，后者是前者的消费方。它与模块无关，所以不能
 * 挂进树里（会让人以为测试任务也按模块归类）。它和「项目概览」一样是项目级
 * 去处，就该和概览待在一起。
 *
 * 结构、行高与选中态一律照抄 `project-overview-link.tsx`（整行一个链接、
 * min-h-7、左侧 2px 指示条）。侧栏行的样式约定见 module-tree.tsx 顶部那段 gutter 注释。
 */
interface TestRunsLinkProps {
	projectId: string;
	selected: boolean;
}

export function TestRunsLink({ projectId, selected }: TestRunsLinkProps) {
	return (
		<Link
			className={cn(
				"flex min-h-7 min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-sm",
				"relative before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground",
				selected
					? "bg-sidebar-selected before:opacity-100"
					: "before:opacity-0 hover:bg-sidebar-accent"
			)}
			params={{ projectId }}
			to="/projects/$projectId/test-runs"
		>
			<ClipboardListIcon className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground" />
			测试评审和执行
		</Link>
	);
}
