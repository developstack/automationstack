import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";

/**
 * 模块树顶上的第 0 行：项目概览。
 *
 * 排在「全部用例」上面：概览回答的是「这个项目现在什么状况」，是进项目后的
 * 第一个问题；用例列表是接下来的动作。但默认落地页仍然是「全部用例」——概览
 * 是主动去看的一页，不是每次进项目都要先过一道的关卡。
 *
 * 单独成文件而不是塞进 module-tree.tsx：那个文件已经贴着 300 行的上限，
 * 而这一行是自洽的一小块——只依赖 projectId 与选中态。
 */
interface ProjectOverviewLinkProps {
	projectId: string;
	selected: boolean;
}

export function ProjectOverviewLink({
	projectId,
	selected,
}: ProjectOverviewLinkProps) {
	return (
		/*
		 * px-2 与模块行同档：加上 aside 的 p-2 正好落在 16px 的侧栏 gutter 上
		 * （约定见 module-tree.tsx 顶部）。
		 *
		 * min-h-7 = 28px，与其它侧栏行对齐：模块行与「全部用例」行尾都挂着
		 * size-6 的图标按钮，撑出 2 + 24 + 2 = 28px 的行高。这一行没有行尾按钮，
		 * 不显式兜住高度就会比上下矮 4px，一眼看得出来。
		 *
		 * 这里不套一层 div 再放 Link：那两行需要外层容器是因为行尾还有第二个
		 * 可点区域（脑图按钮），底色得盖住两者；这一行整行就是一个链接。
		 */
		<Link
			className={cn(
				"flex min-h-7 min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-sm",
				// 同模块行：坐在 bg-sidebar 上就走侧栏令牌，选中态另加左侧 2px 指示条（伪元素）。
				"relative before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground",
				selected
					? "bg-sidebar-selected before:opacity-100"
					: "before:opacity-0 hover:bg-sidebar-accent"
			)}
			params={{ projectId }}
			to="/projects/$projectId/overview"
		>
			<LayoutDashboardIcon className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground" />
			项目概览
		</Link>
	);
}
