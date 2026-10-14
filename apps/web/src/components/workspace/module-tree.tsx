import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { CaseDraftsLink } from "@/components/workspace/case-drafts-link";
import { DeleteModuleDialog } from "@/components/workspace/delete-module-dialog";
import { ModuleSection } from "@/components/workspace/module-section";
import { ModuleTreeList } from "@/components/workspace/module-tree-list";
import { useModuleExpansion } from "@/components/workspace/use-module-expansion";
import { useModuleTreeEdit } from "@/components/workspace/use-module-tree-edit";
import { clearModuleSelection } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

function useHandleModuleDeleted(
	projectId: string,
	selectedModuleId: string | undefined
) {
	const navigate = useNavigate();
	return useCallback(
		(moduleId: string) => {
			if (selectedModuleId !== moduleId) {
				return;
			}
			navigate({
				params: { projectId },
				search: clearModuleSelection,
				to: "/projects/$projectId",
			});
		},
		[navigate, projectId, selectedModuleId]
	);
}

interface ModuleTreeProps {
	projectId: string;
}

/**
 * 用例页左侧的模块树：选择模块、就地新建和重命名、拖拽移动，
 * 删除时输入模块名称确认。
 */
export function ModuleTree({ projectId }: ModuleTreeProps) {
	const treeQuery = useSuspenseQuery(
		orpc.modules.tree.queryOptions({ input: { projectId } })
	);
	const search = useSearch({ strict: false });
	const selectedModuleId = search.moduleId;
	const handleDeleted = useHandleModuleDeleted(projectId, selectedModuleId);
	const [deleting, setDeleting] = useState<ModuleTreeNode | null>(null);
	const closeDelete = useCallback(() => setDeleting(null), []);
	const expansion = useModuleExpansion(
		projectId,
		treeQuery.data,
		selectedModuleId
	);
	const revealParent = useCallback(
		(parentId: string) => expansion.setOpen(parentId, true),
		[expansion]
	);
	const editing = useModuleTreeEdit(setDeleting, revealParent);
	const { startCreate } = editing;
	const createRoot = useCallback(() => startCreate(null), [startCreate]);

	return (
		<aside aria-label="项目导航" className="flex flex-col gap-1 p-2">
			<CaseDraftsLink nodes={treeQuery.data} projectId={projectId} />
			<ModuleSection onCreateRoot={createRoot} projectId={projectId}>
				<ModuleTreeList
					editing={editing}
					expansion={expansion}
					nodes={treeQuery.data}
					projectId={projectId}
					selectedModuleId={selectedModuleId}
				/>
			</ModuleSection>
			<DeleteModuleDialog
				module={deleting}
				onClose={closeDelete}
				onDeleted={handleDeleted}
			/>
		</aside>
	);
}
