import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { Suspense } from "react";

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
 * 只给 title、不给 header：项目切换器已经搬去一级侧栏（project-sidebar.tsx），
 * 换项目是**全局**动作，摆在只有用例段才出现的这块面板里，概览页和测试任务页就
 * 换不了项目了。这里于是退回原语的纯文本标题——那段文本连同 min-h-12 的行高是
 * 与顶栏底边对齐的一环，整行删掉会让面板比主内容区高出半格。
 *
 * title 仍传项目名：这块面板装的是「哪个项目里的东西」，标题回答的正是这个；
 * 窄屏下它同时是抽屉（Dialog）的可访问名，那一份只能是字符串。
 * 树里那行「模块 + 新建」的小标题是 ModuleTree 自己的事，两者不是同一层。
 */
export function ModulePanel({ projectId, projectName }: ModulePanelProps) {
	return (
		<SecondaryPanel title={projectName}>
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
