import { SecondaryPanelProvider } from "@automationstack/ui/components/secondary-panel-context";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { ModulePanel } from "@/components/layout/module-panel";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { readSecondaryPanelDefaultOpen } from "@/components/layout/sidebar-state";
import { useIsCaseSection } from "@/components/layout/use-case-section";

interface ProjectShellProps {
	children: ReactNode;
	projectId: string;
	projectName: string;
}

/**
 * 项目内的外壳：项目作用域的一级侧栏，用例管理这一段再加一层二级模块面板。
 *
 * 满屏高度、侧栏展开位这些外壳共有的东西都在 AppShell 里，这一层只补
 * /projects/$projectId/* 独有的部分：侧栏换成项目作用域的那一份，以及模块面板。
 * 外壳不渲染顶栏：项目页的顶栏要放面包屑和 presence，由外壳统一渲染就得往下传
 * 一堆 slot。顶栏是隔壁 project-shell-header.tsx 的 ProjectShellHeader，
 * 由路由自己往里摆内容。
 *
 * 模块面板只在用例管理这一段出现（判据见 case-section-path.ts）：它装的是模块树，
 * 而概览与测试任务都不按模块归类，在那两页留一列模块树等于摆一份点了没有反应的
 * 导航，还白占 16rem。SecondaryPanelProvider 仍然无条件挂着——它只提供展开位与
 * 一层 flex 壳，按段挂载会让每次进出用例管理都重建一次 context（展开位跟着回到
 * cookie 的初值，面板收着的人一进用例列表就又被展开）。
 *
 * projectName 两处都要：侧栏拿它显示「当前在哪个项目」并作为切换器的按钮文案，
 * 面板拿它当标题与窄屏抽屉的可访问名。切换器只能挂在恒在的侧栏上——挂回按段渲染
 * 的面板里，概览页和测试任务页就换不了项目了。
 */
export function ProjectShell({
	children,
	projectId,
	projectName,
}: ProjectShellProps) {
	const showModulePanel = useIsCaseSection();
	return (
		<AppShell
			sidebar={
				<ProjectSidebar projectId={projectId} projectName={projectName} />
			}
		>
			<SecondaryPanelProvider defaultOpen={readSecondaryPanelDefaultOpen()}>
				{showModulePanel ? (
					<ModulePanel projectId={projectId} projectName={projectName} />
				) : null}
				{/*
				 * min-w-0：主内容里有会撑宽的用例表格，flex 子项默认 min-width:auto，
				 * 缺了它这一格不肯收缩，二级面板一展开表格就把整行顶宽、横向溢出。
				 * minmax(0,1fr) 的栅格行同时给出 min-height:0，把 AppShell 那层的满高
				 * 逐级传下去，内层的 overflow-y-auto 才滚得动。
				 * flex-1 同时兜住「没有二级面板」那一段：面板不在时这一格自己吃满整行。
				 */}
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-1">
					{children}
				</div>
			</SecondaryPanelProvider>
		</AppShell>
	);
}
