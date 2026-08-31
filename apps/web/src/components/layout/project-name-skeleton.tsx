/**
 * 项目名的骨架，自 project-shell-skeleton.tsx 拆出。
 * 两个使用点（顶栏骨架、二级面板标题行）共用这一份，尺寸推导见下。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

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
export function ProjectNameSkeleton() {
	return <Skeleton className="h-5 w-32" />;
}
