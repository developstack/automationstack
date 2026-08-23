import { SecondaryPanelTrigger } from "@automationstack/ui/components/secondary-panel";
import { SecondaryPanelProvider } from "@automationstack/ui/components/secondary-panel-context";
import { ListTreeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AppHeader, AppShell } from "@/components/layout/app-shell";
import { ModulePanel } from "@/components/layout/module-panel";
import { readSecondaryPanelDefaultOpen } from "@/components/layout/sidebar-state";

interface ProjectShellProps {
	children: ReactNode;
	projectId: string;
	projectName: string;
}

/**
 * 项目内的外壳：在全站的 AppShell 之上再加一层二级模块面板。
 *
 * 一级侧栏、满屏高度这些全站共有的东西都在 AppShell 里，这一层只补
 * /projects/$projectId/* 独有的部分——模块面板跟着当前项目走，出了项目就没有意义。
 * 外壳不渲染顶栏：项目页的顶栏要放面包屑和 presence，由外壳统一渲染就得往下传
 * 一堆 slot。改为导出 ProjectShellHeader，路由自己摆内容。
 */
export function ProjectShell({
	children,
	projectId,
	projectName,
}: ProjectShellProps) {
	return (
		<AppShell>
			<SecondaryPanelProvider defaultOpen={readSecondaryPanelDefaultOpen()}>
				<ModulePanel projectId={projectId} projectName={projectName} />
				{/*
				 * min-w-0：主内容里有会撑宽的用例表格，flex 子项默认 min-width:auto，
				 * 缺了它这一格不肯收缩，二级面板一展开表格就把整行顶宽、横向溢出。
				 * minmax(0,1fr) 的栅格行同时给出 min-height:0，把 AppShell 那层的满高
				 * 逐级传下去，内层的 overflow-y-auto 才滚得动。
				 */}
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-1">
					{children}
				</div>
			</SecondaryPanelProvider>
		</AppShell>
	);
}

interface ProjectShellHeaderProps {
	children?: ReactNode;
}

/**
 * 项目页顶栏：全站顶栏再挂一颗二级面板开关。
 *
 * 外观全部来自 AppHeader，这一层只多出「模块面板」这颗按钮——它只在项目内有东西可开。
 */
export function ProjectShellHeader({ children }: ProjectShellHeaderProps) {
	return (
		<AppHeader>
			{/*
			 * 二级面板的开关宽窄屏都在：面板收起后这是唯一的复位入口，而它刻意没有
			 * 全局快捷键（理由见 secondary-panel-context.tsx）。图标特意不用
			 * SidebarTrigger 的 PanelLeftIcon——两颗按钮紧挨着，同一个图标就分不出
			 * 谁开哪一块。
			 */}
			<SecondaryPanelTrigger label="模块面板">
				<ListTreeIcon aria-hidden="true" />
			</SecondaryPanelTrigger>
			{children}
		</AppHeader>
	);
}
