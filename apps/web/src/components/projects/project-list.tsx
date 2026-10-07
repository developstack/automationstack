import type { Project } from "@automationstack/db/schema/projects";
import { Button } from "@automationstack/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

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

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-lg">项目</h1>
				<Button onClick={create}>
					<PlusIcon data-icon="inline-start" />
					新建项目
				</Button>
			</div>
			<ProjectCards
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
