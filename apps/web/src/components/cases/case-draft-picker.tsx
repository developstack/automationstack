import { Button } from "@automationstack/ui/components/button";
import { FilePenLineIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { CaseDraftActions } from "@/components/cases/case-draft-actions";
import {
	caseDraftSavedLabel,
	caseDraftTitle,
} from "@/components/cases/case-draft-labels";
import { DRAFT_BANNER_CLASS } from "@/components/cases/case-draft-notice";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { useLocalCaseDrafts } from "@/components/workspace/use-local-case-drafts";

interface CaseDraftPickerSummaryProps {
	expanded: boolean;
	items: readonly CaseDraft[];
	latest: string;
	onDelete: (caseId: string) => void;
	onToggle: () => void;
	projectId: string;
	single: boolean;
}

function CaseDraftPickerSummary({
	expanded,
	items,
	latest,
	onDelete,
	onToggle,
	projectId,
	single,
}: CaseDraftPickerSummaryProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<p className="min-w-0 flex-1">
				{single
					? `这个模块还有 1 份没写完的草稿（${latest}，只存在这台电脑上），当前这张表单是全新的。`
					: `这个模块还有 ${items.length} 份没写完的草稿（只存在这台电脑上），最近一份是 ${latest}。当前这张表单是全新的。`}
			</p>
			{single ? (
				<CaseDraftActions
					draft={items[0]}
					onDelete={onDelete}
					projectId={projectId}
				/>
			) : (
				<Button
					aria-expanded={expanded}
					onClick={onToggle}
					size="xs"
					type="button"
					variant="outline"
				>
					{expanded ? "收起" : `查看这 ${items.length} 份`}
				</Button>
			)}
		</div>
	);
}

interface CaseDraftPickerListProps {
	items: readonly CaseDraft[];
	onDelete: (caseId: string) => void;
	projectId: string;
}

function CaseDraftPickerList({
	items,
	onDelete,
	projectId,
}: CaseDraftPickerListProps) {
	return (
		<ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
			{items.map((draft) => (
				<li className="flex items-center gap-2" key={draft.caseId}>
					<span className="min-w-0 flex-1 truncate">
						{`${caseDraftTitle(draft)} · ${caseDraftSavedLabel(draft)}`}
					</span>
					<CaseDraftActions
						draft={draft}
						onDelete={onDelete}
						projectId={projectId}
					/>
				</li>
			))}
		</ul>
	);
}

interface CaseDraftPickerProps {
	currentCaseId: string;
	moduleId: string;
	projectId: string;
}

export function CaseDraftPicker({
	currentCaseId,
	moduleId,
	projectId,
}: CaseDraftPickerProps) {
	const drafts = useLocalCaseDrafts(projectId);
	const [expanded, setExpanded] = useState(false);
	const toggle = useCallback(() => setExpanded((prev) => !prev), []);

	const items = useMemo(
		() =>
			drafts.items.filter(
				(draft) => draft.moduleId === moduleId && draft.caseId !== currentCaseId
			),
		[currentCaseId, drafts.items, moduleId]
	);

	if (items.length === 0) {
		return null;
	}

	const latest = caseDraftSavedLabel(items[0]);
	const single = items.length === 1;

	return (
		<div className={DRAFT_BANNER_CLASS} role="status">
			<FilePenLineIcon className="icon-stroke-regular mt-0.5 size-3.5 shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<CaseDraftPickerSummary
					expanded={expanded}
					items={items}
					latest={latest}
					onDelete={drafts.remove}
					onToggle={toggle}
					projectId={projectId}
					single={single}
				/>
				{expanded && !single ? (
					<CaseDraftPickerList
						items={items}
						onDelete={drafts.remove}
						projectId={projectId}
					/>
				) : null}
			</div>
		</div>
	);
}
