import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { cn } from "@automationstack/ui/lib/utils";
import { FilePenLineIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { CaseDraftsDialog } from "@/components/workspace/case-drafts-dialog";
import { useLocalCaseDrafts } from "@/components/workspace/use-local-case-drafts";

interface CaseDraftsLinkProps {
	nodes: readonly ModuleTreeNode[];
	projectId: string;
}

export function CaseDraftsLink({ nodes, projectId }: CaseDraftsLinkProps) {
	const drafts = useLocalCaseDrafts(projectId);
	const [open, setOpen] = useState(false);
	const { refresh } = drafts;

	const handleOpen = useCallback(() => {
		refresh();
		setOpen(true);
	}, [refresh]);
	const handleClose = useCallback(() => setOpen(false), []);

	const count = drafts.items.length;
	if (count === 0 && !open) {
		return null;
	}

	return (
		<>
			{count > 0 ? (
				<button
					aria-label={`未完成草稿，共 ${count} 条`}
					className={cn(
						"flex min-h-8 min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-sm outline-none transition-control",
						"hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
					)}
					onClick={handleOpen}
					type="button"
				>
					<FilePenLineIcon
						aria-hidden="true"
						className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground"
					/>
					<span className="truncate">未完成草稿</span>
					<span className="numeric ms-auto text-muted-foreground text-xs">
						{count}
					</span>
				</button>
			) : null}
			<CaseDraftsDialog
				drafts={drafts.items}
				nodes={nodes}
				onClose={handleClose}
				onDelete={drafts.remove}
				open={open}
				projectId={projectId}
			/>
		</>
	);
}
