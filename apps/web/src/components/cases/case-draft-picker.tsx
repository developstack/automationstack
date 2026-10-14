import {
	Alert,
	AlertActions,
	AlertDescription,
	AlertTitle,
} from "@automationstack/ui/components/alert";
import { Button } from "@automationstack/ui/components/button";
import { ChevronDownIcon, FilePenLineIcon } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";

import { CaseDraftActions } from "@/components/cases/case-draft-actions";
import {
	caseDraftSavedLabel,
	caseDraftTitle,
	UNKNOWN_TIME,
} from "@/components/cases/case-draft-labels";
import { DRAFT_NOTICE_CLASS } from "@/components/cases/case-draft-notice";
import type { CaseDraft } from "@/components/cases/case-draft-parse";
import { useLocalCaseDrafts } from "@/components/workspace/use-local-case-drafts";

interface CaseDraftPickerListProps {
	id: string;
	items: readonly CaseDraft[];
	onDelete: (caseId: string) => void;
	projectId: string;
}

function CaseDraftPickerList({
	id,
	items,
	onDelete,
	projectId,
}: CaseDraftPickerListProps) {
	return (
		<ul
			className="mt-1 flex max-h-40 flex-col divide-y overflow-y-auto rounded-md border bg-background group-has-[>svg]/alert:col-start-2"
			id={id}
		>
			{items.map((draft) => (
				<li className="flex items-center gap-2 px-2 py-1.5" key={draft.caseId}>
					<span className="min-w-0 flex-1 truncate text-foreground">
						{caseDraftTitle(draft)}
					</span>
					<span className="numeric shrink-0 text-muted-foreground text-xs">
						{caseDraftSavedLabel(draft)}
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

interface CaseDraftPickerToggleProps {
	count: number;
	expanded: boolean;
	listId: string;
	onToggle: () => void;
}

function CaseDraftPickerToggle({
	count,
	expanded,
	listId,
	onToggle,
}: CaseDraftPickerToggleProps) {
	return (
		<Button
			aria-controls={expanded ? listId : undefined}
			aria-expanded={expanded}
			onClick={onToggle}
			size="xs"
			type="button"
			variant="outline"
		>
			{expanded ? "收起" : `查看这 ${count} 份`}
			<ChevronDownIcon
				className="transition-transform duration-150 data-[open=true]:rotate-180 motion-reduce:transition-none"
				data-icon="inline-end"
				data-open={expanded}
			/>
		</Button>
	);
}

function draftsDescription(items: readonly CaseDraft[]): string {
	const label = caseDraftSavedLabel(items[0]);
	const saved = label === UNKNOWN_TIME ? "保存时间未知" : `保存于 ${label}`;
	return items.length === 1
		? `「${caseDraftTitle(items[0])}」${saved}，只存在这台电脑上。当前表单是新的。`
		: `最近一份${saved}，草稿只存在这台电脑上。当前表单是新的。`;
}

/** 同一模块中的其他草稿，不包括当前表单自己的草稿。最近保存的在前。 */
function useOtherModuleDrafts(
	projectId: string,
	moduleId: string,
	currentCaseId: string
) {
	const drafts = useLocalCaseDrafts(projectId);
	const items = useMemo(
		() =>
			drafts.items.filter(
				(draft) => draft.moduleId === moduleId && draft.caseId !== currentCaseId
			),
		[currentCaseId, drafts.items, moduleId]
	);
	return { items, remove: drafts.remove };
}

function useDraftListDisclosure() {
	const [expanded, setExpanded] = useState(false);
	const toggle = useCallback(() => setExpanded((prev) => !prev), []);
	const listId = useId();
	return { expanded, listId, toggle };
}

interface CaseDraftPickerProps {
	currentCaseId: string;
	moduleId: string;
	projectId: string;
}

/** 新建面板中的草稿选择：这个模块还有其他未写完的草稿时，可以继续编辑或删除。 */
export function CaseDraftPicker({
	currentCaseId,
	moduleId,
	projectId,
}: CaseDraftPickerProps) {
	const { items, remove } = useOtherModuleDrafts(
		projectId,
		moduleId,
		currentCaseId
	);
	const { expanded, listId, toggle } = useDraftListDisclosure();

	if (items.length === 0) {
		return null;
	}
	const single = items.length === 1;

	return (
		<Alert className={DRAFT_NOTICE_CLASS} role="status" variant="muted">
			<FilePenLineIcon aria-hidden="true" />
			<AlertTitle>
				这个模块还有 <span className="numeric">{items.length}</span>{" "}
				份未写完的草稿
			</AlertTitle>
			<AlertDescription>{draftsDescription(items)}</AlertDescription>
			<AlertActions>
				{single ? (
					<CaseDraftActions
						draft={items[0]}
						onDelete={remove}
						projectId={projectId}
					/>
				) : (
					<CaseDraftPickerToggle
						count={items.length}
						expanded={expanded}
						listId={listId}
						onToggle={toggle}
					/>
				)}
			</AlertActions>
			{expanded && !single ? (
				<CaseDraftPickerList
					id={listId}
					items={items}
					onDelete={remove}
					projectId={projectId}
				/>
			) : null}
		</Alert>
	);
}
