import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { CaseDraftsLink } from "@/components/workspace/case-drafts-link";
import { CreateModuleDialog } from "@/components/workspace/create-module-dialog";
import { DeleteModuleDialog } from "@/components/workspace/delete-module-dialog";
import type { ModuleDialogState } from "@/components/workspace/module-dialog-state";
import type { ModuleNodeActions } from "@/components/workspace/module-node-row";
import { ModuleSection } from "@/components/workspace/module-section";
import { ModuleTreeList } from "@/components/workspace/module-tree-list";
import { useModuleExpansion } from "@/components/workspace/use-module-expansion";
import { clearModuleSelection } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

function useModuleDialogState() {
	const [dialog, setDialog] = useState<ModuleDialogState>(null);
	const close = useCallback(() => setDialog(null), []);
	const createRoot = useCallback(
		() => setDialog({ kind: "create", parentId: null }),
		[]
	);
	const actions = useMemo<ModuleNodeActions>(
		() => ({
			onCreateChild: (parentId) => setDialog({ kind: "create", parentId }),
			onDelete: (node) => setDialog({ kind: "delete", module: node }),
		}),
		[]
	);
	return { actions, close, createRoot, dialog };
}

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

interface ModuleTreeDialogsProps {
	dialog: ModuleDialogState;
	onClose: () => void;
	onDeleted: (moduleId: string) => void;
	projectId: string;
}

function ModuleTreeDialogs(props: ModuleTreeDialogsProps) {
	const { dialog } = props;
	return (
		<>
			<CreateModuleDialog
				onClose={props.onClose}
				parentId={dialog?.kind === "create" ? dialog.parentId : undefined}
				projectId={props.projectId}
			/>
			<DeleteModuleDialog
				module={dialog?.kind === "delete" ? dialog.module : null}
				onClose={props.onClose}
				onDeleted={props.onDeleted}
			/>
		</>
	);
}

interface ModuleTreeProps {
	projectId: string;
}

export function ModuleTree({ projectId }: ModuleTreeProps) {
	const treeQuery = useSuspenseQuery(
		orpc.modules.tree.queryOptions({ input: { projectId } })
	);
	const search = useSearch({ strict: false });
	const selectedModuleId = search.moduleId;
	const handleDeleted = useHandleModuleDeleted(projectId, selectedModuleId);
	const { actions, close, createRoot, dialog } = useModuleDialogState();
	const expansion = useModuleExpansion(
		projectId,
		treeQuery.data,
		selectedModuleId
	);

	return (
		<aside aria-label="项目导航" className="flex flex-col gap-1 p-2">
			<CaseDraftsLink nodes={treeQuery.data} projectId={projectId} />
			<ModuleSection onCreateRoot={createRoot} projectId={projectId}>
				<ModuleTreeList
					actions={actions}
					expansion={expansion}
					nodes={treeQuery.data}
					projectId={projectId}
					selectedModuleId={selectedModuleId}
				/>
			</ModuleSection>
			<ModuleTreeDialogs
				dialog={dialog}
				onClose={close}
				onDeleted={handleDeleted}
				projectId={projectId}
			/>
		</aside>
	);
}
