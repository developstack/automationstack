import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Button, buttonVariants } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import {
	caseDraftSavedLabel,
	caseDraftTitle,
} from "@/components/cases/case-draft-labels";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { TruncatedText } from "@/components/interaction/truncated-text";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { resumeDraftSearch } from "@/components/workspace/workspace-search";

const ORPHAN_MODULE = "模块已删除（无法继续编辑）";

function collectModuleNames(
	nodes: readonly ModuleTreeNode[]
): Map<string, string> {
	const names = new Map<string, string>();
	const walk = (list: readonly ModuleTreeNode[]) => {
		for (const node of list) {
			names.set(node.id, node.name);
			walk(node.children);
		}
	};
	walk(nodes);
	return names;
}

interface CaseDraftRowProps {
	draft: CaseDraft;
	moduleName: string | undefined;
	onDelete: (caseId: string) => void;
	onNavigate: () => void;
	projectId: string;
}

function CaseDraftRow({
	draft,
	moduleName,
	onDelete,
	onNavigate,
	projectId,
}: CaseDraftRowProps) {
	const { caseId, moduleId } = draft;
	const title = caseDraftTitle(draft);

	const resume = useMemo(
		() => resumeDraftSearch(moduleId, caseId),
		[caseId, moduleId]
	);
	const handleDelete = useCallback(() => onDelete(caseId), [caseId, onDelete]);

	const savedLabel = caseDraftSavedLabel(draft);

	return (
		<li className="flex items-center gap-2 rounded-md border p-2">
			<div className="min-w-0 flex-1">
				<TruncatedText className="block font-medium" text={title} />
				<p className="truncate text-muted-foreground text-xs">
					{`${moduleName ?? ORPHAN_MODULE} · ${savedLabel}`}
				</p>
			</div>
			{moduleName === undefined ? null : (
				<Link
					aria-label={`继续编辑 ${savedLabel} 的草稿「${title}」`}
					className={buttonVariants({ size: "xs", variant: "outline" })}
					onClick={onNavigate}
					params={{ projectId }}
					search={resume}
					to="/projects/$projectId"
				>
					继续编辑
				</Link>
			)}
			<Button
				aria-label={`删除 ${savedLabel} 的草稿「${title}」`}
				onClick={handleDelete}
				size="xs"
				type="button"
				variant="ghost"
			>
				删除
			</Button>
		</li>
	);
}

interface CaseDraftsDialogProps {
	drafts: readonly CaseDraft[];
	nodes: readonly ModuleTreeNode[];
	onClose: () => void;
	onDelete: (caseId: string) => void;
	open: boolean;
	projectId: string;
}

export function CaseDraftsDialog({
	drafts,
	nodes,
	onClose,
	onDelete,
	open,
	projectId,
}: CaseDraftsDialogProps) {
	const moduleNames = useMemo(() => collectModuleNames(nodes), [nodes]);
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>未完成草稿</DialogTitle>
					<DialogDescription>
						还没创建成功的新建用例，只留在这台电脑的这个浏览器里，换台机器看不到。编辑已有用例不会产生草稿。
					</DialogDescription>
				</DialogHeader>
				{drafts.length === 0 ? (
					<p className="text-muted-foreground">本机已经没有未完成的草稿了。</p>
				) : (
					<ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
						{drafts.map((draft) => (
							<CaseDraftRow
								draft={draft}
								key={draft.caseId}
								moduleName={moduleNames.get(draft.moduleId)}
								onDelete={onDelete}
								onNavigate={onClose}
								projectId={projectId}
							/>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
