import { Button, buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import {
	caseDraftSavedLabel,
	caseDraftTitle,
} from "@/components/cases/case-draft-labels";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { resumeDraftSearch } from "@/components/workspace/workspace-search";

interface CaseDraftActionsProps {
	draft: CaseDraft;
	onDelete: (caseId: string) => void;
	projectId: string;
}

export function CaseDraftActions({
	draft,
	onDelete,
	projectId,
}: CaseDraftActionsProps) {
	const { caseId, moduleId } = draft;
	const title = caseDraftTitle(draft);
	const savedLabel = caseDraftSavedLabel(draft);

	const resume = useMemo(
		() => resumeDraftSearch(moduleId, caseId),
		[caseId, moduleId]
	);
	const handleDelete = useCallback(() => onDelete(caseId), [caseId, onDelete]);

	return (
		<>
			<Link
				aria-label={`继续编辑 ${savedLabel} 的草稿「${title}」`}
				className={buttonVariants({ size: "xs", variant: "outline" })}
				params={{ projectId }}
				search={resume}
				to="/projects/$projectId"
			>
				继续编辑
			</Link>
			<Button
				aria-label={`删除 ${savedLabel} 的草稿「${title}」`}
				onClick={handleDelete}
				size="xs"
				type="button"
				variant="ghost"
			>
				删除
			</Button>
		</>
	);
}
