/**
 * 评审阶段：勾选提案 → 采纳到指定模块 / 拒绝。
 * 已处理的提案保留在列表里（置灰）作为本轮生成的记录。
 */
import type { AiProposalStatus } from "@automationstack/db/schema/ai";
import { Button } from "@automationstack/ui/components/button";
import { Checkbox } from "@automationstack/ui/components/checkbox";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Label } from "@automationstack/ui/components/label";
import { SparklesIcon } from "lucide-react";

import type { AiProposalEntry } from "@/components/ai/ai-generation-state";
import { AiProposalActionBar } from "@/components/ai/ai-proposal-action-bar";
import { AiProposalItem } from "@/components/ai/ai-proposal-item";
import { useAiProposalReview } from "@/components/ai/use-ai-proposal-review";

const SELECT_ALL_ID = "ai-proposal-select-all";

interface SelectAllRowProps {
	checked: boolean;
	disabled: boolean;
	onToggle: () => void;
	total: number;
}

function SelectAllRow(props: SelectAllRowProps) {
	return (
		<div className="flex items-center gap-3">
			<Checkbox
				checked={props.checked}
				disabled={props.disabled}
				id={SELECT_ALL_ID}
				onCheckedChange={props.onToggle}
			/>
			<Label htmlFor={SELECT_ALL_ID}>全选待评审提案（{props.total}）</Label>
		</div>
	);
}

interface ProposalItemsProps {
	onToggle: (id: string) => void;
	proposals: AiProposalEntry[];
	selected: string[];
}

function ProposalItems({ onToggle, proposals, selected }: ProposalItemsProps) {
	// 用 Set 判定勾选：数组 includes 在百条提案下是 O(n²) 次字符串比较。
	const selectedIds = new Set(selected);
	return (
		<ul className="flex flex-col gap-2">
			{proposals.map((entry) => (
				<AiProposalItem
					entry={entry}
					key={entry.id}
					onToggle={onToggle}
					selected={selectedIds.has(entry.id)}
				/>
			))}
		</ul>
	);
}

/** 本轮一条提案都没产出：直接给「重新生成」入口，不让用户去翻按钮。 */
function AiProposalsEmpty({ onRestart }: { onRestart: () => void }) {
	return (
		<Empty className="border border-dashed p-4 md:p-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SparklesIcon />
				</EmptyMedia>
				<EmptyTitle>本轮没有产出提案</EmptyTitle>
				<EmptyDescription>
					可以补充更具体的需求描述后重新生成。
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button onClick={onRestart} size="sm" variant="outline">
					重新生成
				</Button>
			</EmptyContent>
		</Empty>
	);
}

export interface AiProposalListProps {
	moduleId: string | undefined;
	onModuleChange: (moduleId: string | undefined) => void;
	onRestart: () => void;
	onStatusChange: (proposalIds: string[], status: AiProposalStatus) => void;
	projectId: string;
	proposals: AiProposalEntry[];
}

export function AiProposalList(props: AiProposalListProps) {
	const review = useAiProposalReview({
		moduleId: props.moduleId,
		onStatusChange: props.onStatusChange,
		proposals: props.proposals,
	});
	const { pendingIds, selection } = review;

	if (props.proposals.length === 0) {
		return <AiProposalsEmpty onRestart={props.onRestart} />;
	}

	return (
		<div className="flex flex-col gap-3">
			<SelectAllRow
				checked={
					pendingIds.length > 0 &&
					selection.selected.length === pendingIds.length
				}
				disabled={pendingIds.length === 0}
				onToggle={selection.toggleAll}
				total={pendingIds.length}
			/>
			<ProposalItems
				onToggle={selection.toggle}
				proposals={props.proposals}
				selected={selection.selected}
			/>
			<AiProposalActionBar
				acceptPending={review.acceptPending}
				moduleId={props.moduleId}
				onAccept={review.accept}
				onModuleChange={props.onModuleChange}
				onReject={review.reject}
				onRestart={props.onRestart}
				projectId={props.projectId}
				rejectPending={review.rejectPending}
				selectedCount={selection.selected.length}
			/>
		</div>
	);
}
