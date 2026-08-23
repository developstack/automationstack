import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { Suspense } from "react";

import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { ModuleTree } from "@/components/workspace/module-tree";

/** 骨架行的稳定 key：条数固定，用下标当 key 会被 lint 拦下。 */
const MODULE_SKELETON_KEYS = ["title", "all-cases", "first", "second"];

function ModuleTreeFallback() {
	return (
		// h-7 与 ModuleTree 的行高同档，数据到达时不会整块跳一格
		<div aria-hidden="true" className="flex flex-col gap-1 p-2">
			{MODULE_SKELETON_KEYS.map((key) => (
				<Skeleton className="h-7 w-full" key={key} />
			))}
		</div>
	);
}

interface ModulePanelProps {
	projectId: string;
	projectName: string;
}

/**
 * 二级面板：当前项目的模块树。
 *
 * 面板标题给项目名——这块面板装的是「哪个项目里的东西」，标题回答的正是这个；
 * 而「当前是哪个项目」的下一句话往往是「换一个」，于是可见的那一份做成切换器，
 * title 仍传项目名，窄屏下它充当抽屉的可访问名（字符串，切换器顶不了这个班）。
 * 树里那行「模块 + 新建」的小标题是 ModuleTree 自己的事，两者不是同一层。
 */
export function ModulePanel({ projectId, projectName }: ModulePanelProps) {
	return (
		<SecondaryPanel
			header={
				<ProjectSwitcher projectId={projectId} projectName={projectName} />
			}
			title={projectName}
		>
			{/*
			 * 必须自带 Suspense 边界：切项目时 params 先变、loader 还没回来，
			 * 模块树的 useSuspenseQuery 会挂起。没有这层边界，挂起会一路冒泡到
			 * 根布局，把整个外壳（导航、用户区、主内容）一起变成空白。
			 */}
			<Suspense fallback={<ModuleTreeFallback />}>
				<ModuleTree projectId={projectId} />
			</Suspense>
		</SecondaryPanel>
	);
}
