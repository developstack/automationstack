import type { Project } from "@automationstack/db/schema/projects";
import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";

interface ProjectSwitcherItemProps {
	isCurrent: boolean;
	project: Project;
}

export function ProjectSwitcherItem({
	isCurrent,
	project,
}: ProjectSwitcherItemProps) {
	if (isCurrent) {
		return (
			<DropdownMenuItem aria-current="true">
				<span className="min-w-0 flex-1 truncate">{project.name}</span>
				<CheckIcon aria-hidden="true" />
			</DropdownMenuItem>
		);
	}
	return (
		<DropdownMenuItem
			render={
				<Link
					params={{ projectId: project.id }}
					to="/projects/$projectId/overview"
				/>
			}
		>
			<span className="min-w-0 flex-1 truncate">{project.name}</span>
		</DropdownMenuItem>
	);
}
