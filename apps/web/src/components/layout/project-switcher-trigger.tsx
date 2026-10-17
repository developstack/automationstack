import { DropdownMenuTrigger } from "@automationstack/ui/components/dropdown-menu";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { ChevronsUpDownIcon } from "lucide-react";

import { ProjectMark } from "@/components/layout/project-mark";
import {
	useViewerProjectRole,
	type ViewerProjectRole,
} from "@/components/project-members/use-viewer-project-role";

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
					className="flex h-12 w-full items-center gap-2.5 rounded-md border bg-card pr-2 pl-bordered-inset text-left text-card-foreground shadow-card outline-none transition-control hover:bg-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-accent"
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
