import { DropdownMenuTrigger } from "@automationstack/ui/components/dropdown-menu";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { ChevronsUpDownIcon } from "lucide-react";

import {
	useViewerProjectRole,
	type ViewerProjectRole,
} from "@/components/project-members/use-viewer-project-role";

const EMPTY_NAME_INITIAL = "?";

/** 项目名的第一个字符。项目名为空时显示问号。 */
const projectInitial = (projectName: string): string =>
	[...projectName][0] ?? EMPTY_NAME_INITIAL;

function ProjectMark({ projectName }: { projectName: string }) {
	return (
		<span
			aria-hidden="true"
			className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground text-xs"
		>
			{projectInitial(projectName)}
		</span>
	);
}

function ProjectRoleLine({ isPending, label }: ViewerProjectRole) {
	if (isPending) {
		return <Skeleton aria-hidden="true" className="my-0.5 h-3.5 w-12" />;
	}
	if (label === null) {
		return null;
	}
	return (
		<span className="truncate text-caption text-muted-foreground">{label}</span>
	);
}

interface ProjectSwitcherTriggerProps {
	projectId: string;
	projectName: string;
}

export function ProjectSwitcherTrigger({
	projectId,
	projectName,
}: ProjectSwitcherTriggerProps) {
	const role = useViewerProjectRole(projectId);
	const roleSuffix = role.label === null ? "" : `，你的角色是${role.label}`;
	return (
		<DropdownMenuTrigger
			render={
				<button
					aria-label={`切换项目：当前是 ${projectName}${roleSuffix}`}
					className="flex w-full items-center gap-2.5 rounded-lg border bg-card p-2 text-left text-card-foreground shadow-card outline-none transition-control hover:bg-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-accent"
					type="button"
				>
					<ProjectMark projectName={projectName} />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-medium text-sm">{projectName}</span>
						<ProjectRoleLine isPending={role.isPending} label={role.label} />
					</span>
					<ChevronsUpDownIcon
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground"
					/>
				</button>
			}
		/>
	);
}
