import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { RunCaseGroupItem } from "@/components/test-runs/run-case-group-item";
import { buildRunCaseGroups } from "@/components/test-runs/run-case-groups";
import {
	type RunCaseRowContext,
	RunCaseRows,
} from "@/components/test-runs/run-case-rows";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { useModuleExpansion } from "@/components/workspace/use-module-expansion";
import { orpc } from "@/utils/orpc";

const NO_MODULES: readonly ModuleTreeNode[] = [];

const EXPANSION_SCOPE = "run-case-groups";

export interface RunCaseGroupListProps extends RunCaseRowContext {
	cases: readonly RunCaseDetail[];
	projectId: string;
	runId: string;
	selectedModuleId: string | null;
}

/**
 * 测试任务左栏的用例列表：按模块树分组，模块可折叠。
 * 模块树还没到时先按测试任务里的顺序平铺，避免列表空一下再出现。
 */
export function RunCaseGroupList({
	cases,
	projectId,
	runId,
	selectedModuleId,
	...rows
}: RunCaseGroupListProps) {
	const treeQuery = useQuery(
		orpc.modules.tree.queryOptions({ input: { projectId } })
	);
	const tree = treeQuery.data;
	const expansion = useModuleExpansion({
		nodes: tree ?? NO_MODULES,
		openSelected: true,
		scope: EXPANSION_SCOPE,
		selectedModuleId: selectedModuleId ?? undefined,
		storageId: runId,
	});
	const groups = useMemo(
		() => (tree === undefined ? [] : buildRunCaseGroups(cases, tree)),
		[cases, tree]
	);

	if (tree === undefined) {
		return <RunCaseRows {...rows} cases={cases} />;
	}

	return (
		<ul className="flex flex-col gap-0.5">
			{groups.map((group) => (
				<li key={group.moduleId}>
					<RunCaseGroupItem
						{...rows}
						depth={0}
						expansion={expansion}
						group={group}
					/>
				</li>
			))}
		</ul>
	);
}
