/**
 * 渲染预算护栏的界面说明。
 *
 * 静默截断是不能接受的：用户会以为数据丢了。所以只要预算收窄了展开范围，
 * 就必须在画布上方讲清楚三件事——为什么没全展开、现在展开到哪一层、
 * 怎么看到更多（点 `+` 自己展开，数据一条都没少）。
 */
import { useMemo } from "react";

import { MINDMAP_NODE_BUDGET, planMindmapRender } from "./mindmap-budget.ts";
import {
	type MindmapProject,
	type MindmapTreeData,
	toMindmapTreeInput,
} from "./mindmap-tree-input.ts";

interface MindmapBudgetNoticeProps {
	data: MindmapTreeData;
	project: MindmapProject;
}

function describeDepth(expandDepth: number): string {
	return expandDepth === 0
		? "一级模块也全部折叠"
		: `最深只展开到第 ${expandDepth} 层模块`;
}

export function MindmapBudgetNotice({
	data,
	project,
}: MindmapBudgetNoticeProps) {
	const plan = useMemo(
		() => planMindmapRender(toMindmapTreeInput(project, data)),
		[data, project]
	);
	if (!plan.limited) {
		return null;
	}
	return (
		<p
			className="border-b bg-muted px-4 py-2 text-muted-foreground text-sm"
			data-testid="mindmap-budget-notice"
		>
			项目较大：全部展开需要 {plan.totalNodeCount} 个节点，超过了{" "}
			{MINDMAP_NODE_BUDGET} 个节点的渲染预算（再多每次刷新都会明显卡顿）。
			画布因此{describeDepth(plan.expandDepth)}，当前渲染{" "}
			{plan.renderedNodeCount} 个节点，装不下的模块连同它们的用例已折叠。
			数据一条都没少：点击节点上的加号即可展开查看。此外同时最多展开{" "}
			{plan.expandedCaseAllowance} 条用例的步骤，超出的会被自动收起。
		</p>
	);
}
