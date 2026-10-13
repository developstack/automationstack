import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@automationstack/ui/components/alert";
import { InfoIcon } from "lucide-react";
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
		<Alert data-testid="mindmap-budget-notice" role="note" variant="muted">
			<InfoIcon aria-hidden="true" />
			<AlertTitle>项目较大，部分模块已折叠</AlertTitle>
			<AlertDescription>
				全部展开需要 <span className="numeric">{plan.totalNodeCount}</span>{" "}
				个节点，超过了 <span className="numeric">{MINDMAP_NODE_BUDGET}</span>{" "}
				个节点的渲染预算（再多每次刷新都会明显卡顿）。画布因此
				{describeDepth(plan.expandDepth)}，当前渲染{" "}
				<span className="numeric">{plan.renderedNodeCount}</span>{" "}
				个节点，装不下的模块连同它们的用例已折叠。数据一条都没少：点击节点上的加号即可展开查看。此外同时最多展开{" "}
				<span className="numeric">{plan.expandedCaseAllowance}</span>{" "}
				条用例的步骤，超出的会被自动收起。
			</AlertDescription>
		</Alert>
	);
}
