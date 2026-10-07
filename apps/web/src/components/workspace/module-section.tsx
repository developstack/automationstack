import { Button, buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { NetworkIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { clearModuleSelection } from "@/components/workspace/workspace-search";

const HEADING_ID = "workspace-module-section-heading";

interface ModuleSectionProps {
	children: ReactNode;
	onCreateRoot: () => void;
	projectId: string;
}

export function ModuleSection({
	children,
	onCreateRoot,
	projectId,
}: ModuleSectionProps) {
	return (
		<section aria-labelledby={HEADING_ID} className="flex flex-col gap-1">
			<div className="flex items-center justify-between px-2">
				<h2
					className="font-medium text-muted-foreground text-xs"
					id={HEADING_ID}
				>
					模块
				</h2>
				<div className="flex items-center">
					<Link
						aria-label="全项目脑图"
						className={buttonVariants({
							className: "text-muted-foreground",
							size: "icon-xs",
							variant: "ghost",
						})}
						params={{ projectId }}
						search={clearModuleSelection}
						to="/projects/$projectId/mindmap"
					>
						<NetworkIcon />
					</Link>
					<Button
						aria-label="新建根模块"
						onClick={onCreateRoot}
						size="icon-xs"
						variant="ghost"
					>
						<PlusIcon />
					</Button>
				</div>
			</div>
			{children}
		</section>
	);
}
