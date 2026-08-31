/**
 * 全站顶栏，自 app-shell.tsx 拆出（外壳与顶栏各自一个文件）。
 * 两者仍是同一套外壳的两半：AppShell 给满屏高度与滚动容器，这一条给顶栏。
 */
import { SidebarTrigger } from "@automationstack/ui/components/sidebar";
import type { ReactNode } from "react";

interface AppHeaderProps {
	children?: ReactNode;
}

/**
 * 全站顶栏。
 *
 * sticky + 不透明底色 + 下边框：主内容是自己滚的，顶栏不粘住的话
 * 内容会从它底下穿过去，滚一屏就分不清哪行属于顶栏、哪行属于内容。
 * 各页专属的内容（面包屑、presence、页名）由调用方塞进 children，
 * 外观只此一份，页与页之间来回切时顶栏不会跳。
 */
export function AppHeader({ children }: AppHeaderProps) {
	return (
		/*
		 * px-4 = 工作区 gutter 16px（约定见 components/workspace/module-tree.tsx 顶部）；
		 * backdrop-blur 配半透明底色：滚动的内容在顶栏下方化开，而不是硬生生被切断。
		 *
		 * 高度用 min-h-12 而不是 h-12：宽屏下这一行最高的是 32px 的图标按钮
		 * （SidebarTrigger 与 SecondaryPanelTrigger 都是 Button size="icon" = size-8），
		 * 配 py-1 与 border-b 只有 4 + 32 + 4 + 1 = 41px，够不到 48px，于是由 min-h-12
		 * 兜到 48px。box-sizing 是 border-box，这 48px 含最后那条 1px 下边框，正好与二级
		 * 面板标题行的 min-h-12（同为 48px、无 py 无边框）落在同一条底边上，
		 * 见 packages/ui/src/components/secondary-panel.tsx 的标题行。
		 * py 不能是 2：8 + 32 + 8 + 1 = 49px 会顶穿 min-h-12。只多 1px 也不能要——
		 * 两行的底边一旦不再共线，顶栏与面板标题行之间就多出一道对不齐的错位，
		 * 而这道错位横贯整个宽屏视口，比 1px 这个数字显眼得多。余量只剩 1px 也说明
		 * 这条推导很脆：谁再往里塞更高的控件就会把 min-h-12 顶穿，改之前先回来算一遍。
		 * 写死 h-12 同样不行：390px 上面包屑和头像挤不下会各自换行，写死高度只会让
		 * 它们从 48px 的框里溢出去、压在边框上。flex-wrap + gap-y-2 让它们规规矩矩
		 * 换到第二行，py-1 到那时才真正吃上，顶栏跟着长高。
		 */
		<header className="sticky top-0 z-30 flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/95 px-4 py-1 backdrop-blur">
			{/*
			 * 一级侧栏的开关只留给窄屏（断点与 hooks/use-compact-viewport.ts 的 1024px
			 * 一致）：宽屏的开关已经在侧栏品牌行右侧的收起按钮和右缘细条上，顶栏再放一颗
			 * 就是第三个同义按钮；而窄屏的侧栏是整块滑走的抽屉，没有它就再也叫不回来。
			 */}
			<SidebarTrigger className="lg:hidden" />
			{children}
		</header>
	);
}
