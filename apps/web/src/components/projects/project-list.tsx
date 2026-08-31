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

/** Dialog state plus the stable callbacks the project cards trigger. */
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
				{/*
				 * 主题切换在账户菜单里，也就是侧栏底部的 SidebarUser——这一页如今也有
				 * 侧栏了（PlatformSidebar），与项目内是同一处。此前它没有侧栏，那颗菜单
				 * 只好另挂在裸壳顶栏右端，那份重复实现已随 plain-shell.tsx 一起删掉。
				 * 全站只此一个入口，不在每页各放一个。
				 */}
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
