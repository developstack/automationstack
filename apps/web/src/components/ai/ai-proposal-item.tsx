/**
 * 评审列表的一行提案：勾选框 + 优先级/类型徽章 + 可展开的步骤。
 * 已采纳/已拒绝的提案置灰且不可再勾选。
 */
import type {
	AiProposalStatus,
	ProposedCase,
} from "@automationstack/db/schema/ai";
import { Badge } from "@automationstack/ui/components/badge";
import { Checkbox } from "@automationstack/ui/components/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@automationstack/ui/components/collapsible";
import { Label } from "@automationstack/ui/components/label";
import { cn } from "@automationstack/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { memo, useCallback } from "react";

import type { AiProposalEntry } from "@/components/ai/ai-generation-state";
import {
	CASE_TYPE_LABELS,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";

const HANDLED_LABELS: Record<AiProposalStatus, string | null> = {
	accepted: "已采纳",
	proposed: null,
	rejected: "已拒绝",
};

/**
 * 状态徽章的进场。它是「采纳成功了」这句话的**唯一常驻证据**——toast 几秒后就
 * 消失，行淡下去只说明「这行不用管了」，说不出是采纳还是拒绝。所以它出现的
 * 那一下值得被看到。
 *
 * 200ms 比行退场的 300ms 快一档，两者同时开始：徽章先站定，行再退到底。
 * 顺序反过来（行先淡完、徽章才出现）会读成两件互不相干的事。
 *
 * slide-in-from-left-1：徽章总是接在前面两枚徽章之后，从左边 4px 处滑进来，
 * 方向与它在这一行里的位置一致——像是接上去的，而不是叠上去的。
 *
 * 元素在状态翻转前根本不存在（handledLabel 为 null），所以这里只能用
 * keyframes：没有「当前值」可供 transition 插值。它也不会被快切——
 * 一旦采纳/拒绝就停在这里。
 */
const BADGE_ENTER = "animate-in fade-in-0 slide-in-from-left-1 duration-200";

function ProposalSteps({ proposal }: { proposal: ProposedCase }) {
	return (
		<div className="flex flex-col gap-2 pt-2 text-xs">
			{proposal.preconditions === null ? null : (
				<p className="text-muted-foreground">
					前置条件：{proposal.preconditions}
				</p>
			)}
			<ol className="flex list-decimal flex-col gap-1 pl-4">
				{proposal.steps.map((step) => (
					<li key={step.id}>
						<span>{step.step}</span>
						<span className="text-muted-foreground"> → {step.expected}</span>
					</li>
				))}
			</ol>
			{proposal.tags.length === 0 ? null : (
				<div className="flex flex-wrap gap-1">
					{proposal.tags.map((tag) => (
						<Badge key={tag} variant="outline">
							{tag}
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}

interface ProposalHeaderProps {
	checkboxId: string;
	entry: AiProposalEntry;
}

function ProposalHeader({ checkboxId, entry }: ProposalHeaderProps) {
	const handledLabel = HANDLED_LABELS[entry.status];
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Label className="font-medium text-sm" htmlFor={checkboxId}>
				{entry.proposal.name}
			</Label>
			<Badge variant={PRIORITY_BADGE_VARIANTS[entry.proposal.priority]}>
				{entry.proposal.priority}
			</Badge>
			<Badge variant="outline">
				{CASE_TYPE_LABELS[entry.proposal.caseType]}
			</Badge>
			{handledLabel === null ? null : (
				<Badge className={BADGE_ENTER} variant="secondary">
					{handledLabel}
				</Badge>
			)}
		</div>
	);
}

export interface AiProposalItemProps {
	entry: AiProposalEntry;
	onToggle: (id: string) => void;
	selected: boolean;
}

/**
 * 已处理的行淡到 60% 的过渡。
 *
 * 刻意**不**复用 transition-control（150ms）：那一档服务的是「我按下去了」
 * 这类要求即时回应的交互，快是它的全部意义。这里表达的是相反的东西——
 * 一行提案被采纳之后从待办里**退场**。300ms 让这一步读起来是「让位」
 * 而不是「被关掉」，一次采纳十行时，十行一起缓缓退下去也不像十盏灯同时灭。
 *
 * 只列 opacity：边框与圆角不变，transition-all 会把 padding / border-color
 * 一并卷进来，行数一多就是白烧的合成开销。ease-out 与仓库其余过渡同向：
 * 起步快、收尾慢，符合「东西被放下」的物理直觉。
 *
 * 这是全流程的收尾反馈，不是高频交互——它每次生成只会发生一到两次。
 */
const HANDLED_TRANSITION = "transition-opacity duration-300 ease-out";

function ProposalRow({ entry, onToggle, selected }: AiProposalItemProps) {
	const handleToggle = useCallback(
		() => onToggle(entry.id),
		[entry.id, onToggle]
	);
	const handled = entry.status !== "proposed";
	const checkboxId = `ai-proposal-${entry.id}`;

	return (
		<li
			className={cn(
				"rounded-lg border p-3",
				HANDLED_TRANSITION,
				handled && "opacity-60"
			)}
		>
			<div className="flex items-start gap-3">
				<Checkbox
					checked={selected}
					className="mt-0.5"
					disabled={handled}
					id={checkboxId}
					onCheckedChange={handleToggle}
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<ProposalHeader checkboxId={checkboxId} entry={entry} />
					<Collapsible className="group/proposal-steps">
						<CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs transition-control hover:text-foreground">
							{/* 箭头随展开翻转：展开与否原本只体现在下方内容有没有出现，
							    折叠状态下这个触发器自己没有任何状态提示。 */}
							<ChevronDownIcon
								aria-hidden={true}
								className="icon-stroke-regular size-3.5 transition-transform group-data-open/proposal-steps:rotate-180"
							/>
							查看步骤（{entry.proposal.steps.length}）
						</CollapsibleTrigger>
						<CollapsibleContent>
							<ProposalSteps proposal={entry.proposal} />
						</CollapsibleContent>
					</Collapsible>
				</div>
			</div>
		</li>
	);
}

/**
 * 一次生成上百条提案时，勾选任意一行都会重渲染整份列表：实测 100 条提案下
 * 单行勾选要 40–110ms（4x CPU 节流下 270–470ms）。行本身是纯展示的，
 * memo 之后只有状态真正变化的那一行会重渲染。
 */
export const AiProposalItem = memo(ProposalRow);
