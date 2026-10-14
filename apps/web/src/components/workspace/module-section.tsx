import { Button, buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { NetworkIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { createRootButtonAttributes } from "@/components/workspace/module-tree-focus";
import { clearModuleSelection } from "@/components/workspace/workspace-search";

const HEADING_ID = "workspace-module-section-heading";

interface ModuleSectionProps {
	children: ReactNode;
	onCreateRoot: () => void;
	projectId: string;
}

/** 模块区域：小标签「模块」，右侧是全项目脑图和新建根模块。 */
export function ModuleSection({
	children,
	onCreateRoot,
	projectId,
}: ModuleSectionProps) {
	return (
		<section aria-labelledby={HEADING_ID} className="flex flex-col gap-1">
			<div className="flex min-h-7 items-center justify-between ps-2">
				<h2 className="eyebrow" id={HEADING_ID}>
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
						<NetworkIcon aria-hidden="true" />
					</Link>
					<Button
						aria-label="新建根模块"
						className="text-muted-foreground"
						onClick={onCreateRoot}
						size="icon-xs"
						variant="ghost"
						{...createRootButtonAttributes}
					>
						<PlusIcon aria-hidden="true" />
					</Button>
				</div>
			</div>
			{children}
		</section>
	);
}
