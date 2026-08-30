import type { Project } from "@automationstack/db/schema/projects";
import { Button } from "@automationstack/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { formatDateTime } from "@/components/cases/case-meta";
import {
	DeleteProjectDialog,
	ProjectFormDialog,
} from "@/components/projects/project-form-dialog";
import { orpc } from "@/utils/orpc";

type ProjectDialogState =
	| { kind: "create" }
	| { kind: "delete"; project: Project }
	| { kind: "edit"; project: Project }
	| null;

interface ProjectCardProps {
	onDelete: (project: Project) => void;
	onEdit: (project: Project) => void;
	project: Project;
}

function ProjectCard({ onDelete, onEdit, project }: ProjectCardProps) {
	const handleEdit = useCallback(() => onEdit(project), [onEdit, project]);
	const handleDelete = useCallback(
		() => onDelete(project),
		[onDelete, project]
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{/*
					 * 进项目落在概览，不是用例列表：「这个项目现在什么状况」是进来之后
					 * 的第一个问题，用例列表是接下来的动作。项目根路径本身仍旧是用例
					 * 列表（一级侧栏「用例管理」那一项就指着它），这里改的只是入口的落点。
					 */}
					<Link
						className="hover:underline"
						params={{ projectId: project.id }}
						to="/projects/$projectId/overview"
					>
						{project.name}
					</Link>
				</CardTitle>
				<CardDescription className="line-clamp-2">
					{project.description ?? "暂无描述"}
				</CardDescription>
				<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
					<span>更新于 {formatDateTime(project.updatedAt)}</span>
					<DropdownMenu>
						{/* 带项目名：读屏的按钮列表里，同名的「项目操作」互相分辨不出来 */}
						<DropdownMenuTrigger
							render={
								<Button
									aria-label={`项目「${project.name}」操作`}
									size="icon-xs"
									variant="ghost"
								>
									<MoreHorizontalIcon />
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleEdit}>编辑</DropdownMenuItem>
							<DropdownMenuItem onClick={handleDelete} variant="destructive">
								删除
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardHeader>
		</Card>
	);
}

function ProjectsEmpty() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>还没有项目</EmptyTitle>
				<EmptyDescription>点击「新建项目」创建第一个项目。</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

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

interface ProjectCardsProps {
	onDelete: (project: Project) => void;
	onEdit: (project: Project) => void;
	projects: Project[];
}

function ProjectCards({ onDelete, onEdit, projects }: ProjectCardsProps) {
	if (projects.length === 0) {
		return <ProjectsEmpty />;
	}
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{projects.map((project) => (
				<ProjectCard
					key={project.id}
					onDelete={onDelete}
					onEdit={onEdit}
					project={project}
				/>
			))}
		</div>
	);
}

const SKELETON_CARD_KEYS = ["c1", "c2", "c3"] as const;

/**
 * 路由 pendingComponent：卡片骨架，避免加载期出现空白页。
 * 结构必须与 ProjectList 逐层对齐（外层 flex-col gap-4 + 标题行 + 卡片栅格）：
 * 此前骨架只画了卡片栅格，数据到达时凭空插入 32px 的标题行，整页卡片往下跳一截。
 * 标题行的三个骨架分别对应 h1（text-lg，行高 28px = h-7）、
 * 主题切换按钮（size="icon" = size-8）与默认按钮（h-8）。
 */
export function ProjectListSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="项目列表加载中"
			className="flex flex-col gap-4"
		>
			<div className="flex items-center justify-between">
				<Skeleton className="h-7 w-16" />
				<div className="flex items-center gap-2">
					<Skeleton className="size-8" />
					<Skeleton className="h-8 w-24" />
				</div>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{SKELETON_CARD_KEYS.map((key) => (
					<Skeleton className="h-28 w-full rounded-xl" key={key} />
				))}
			</div>
		</output>
	);
}

export function ProjectList() {
	const projectsQuery = useSuspenseQuery(orpc.projects.list.queryOptions());
	const { close, create, dialog, edit, remove } = useProjectDialogState();

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-lg">项目</h1>
				{/*
				 * 主题切换在账户菜单里：这一页没有侧栏，那颗菜单挂在顶栏右端
				 * （plain-shell.tsx），项目内则在侧栏底部。总之全站只此一个入口，
				 * 不在每页各放一个。
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
