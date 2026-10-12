import { canCreateProject } from "@automationstack/api/lib/project-access";
import type { Project } from "@automationstack/db/schema/projects";
import { Button } from "@automationstack/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useSession } from "@/components/auth/use-session";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import { ProjectCards } from "@/components/projects/project-cards";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { orpc } from "@/utils/orpc";

type ProjectDialogState =
	| { kind: "create" }
	| { kind: "delete"; project: Project }
	| { kind: "edit"; project: Project }
	| null;

function useProjectDialogState() {
	const [dialog, setDialog] = useState<ProjectDialogState>(null);
	const close = useCallback(() => setDialog(null), []);
	const create = useCallback(() => setDialog({ kind: "create" }), []);
	const edit = useCallback(
		(project: Project) => setDialog({ kind: "edit", project }),
		[]
	);
	const remove = useCallback(
		(project: Project) => setDialog({ kind: "delete", project }),
		[]
	);
	return { close, create, dialog, edit, remove };
}

export function ProjectList() {
	const projectsQuery = useSuspenseQuery(orpc.projects.list.queryOptions());
	const { close, create, dialog, edit, remove } = useProjectDialogState();
	const { user } = useSession();
	// 普通用户不能新建项目，所以不显示按钮。服务端也检查。
	const canCreate = user !== null && canCreateProject(user.role);

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-lg">项目</h1>
				{canCreate ? (
					<Button onClick={create}>
						<PlusIcon data-icon="inline-start" />
						新建项目
					</Button>
				) : null}
			</div>
			<ProjectCards
				canCreate={canCreate}
				onDelete={remove}
				onEdit={edit}
				projects={projectsQuery.data}
			/>
			<ProjectFormDialog
				onClose={close}
				open={dialog?.kind === "create" || dialog?.kind === "edit"}
				project={dialog?.kind === "edit" ? dialog.project : null}
			/>
			<DeleteProjectDialog
				onClose={close}
				project={dialog?.kind === "delete" ? dialog.project : null}
			/>
		</section>
	);
}
