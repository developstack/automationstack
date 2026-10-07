import { Badge } from "@automationstack/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";

import type { StepDiffEntry, StepDiffKind, StepsDiff } from "./step-diff.ts";
import { StepTextCell } from "./step-text-cell.tsx";

interface StepKindMeta {
	badgeClass: string;
	label: string;
}

const STEP_KIND_META: Record<StepDiffKind, StepKindMeta> = {
	added: {
		badgeClass:
			"border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
		label: "新增",
	},
	modified: {
		badgeClass:
			"border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
		label: "修改",
	},
	moved: {
		badgeClass:
			"border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
		label: "移动",
	},
	removed: {
		badgeClass:
			"border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
		label: "删除",
	},
	unchanged: { badgeClass: "text-muted-foreground", label: "未变" },
};

const KIND_ORDER: readonly StepDiffKind[] = [
	"added",
	"removed",
	"modified",
	"moved",
	"unchanged",
];

function humanIndex(index: number | null): string {
	return index === null ? "—" : String(index + 1);
}

function orderLabel(entry: StepDiffEntry): string {
	if (entry.kind === "moved") {
		return `${humanIndex(entry.oldIndex)} → ${humanIndex(entry.newIndex)}`;
	}
	if (entry.kind === "removed") {
		return humanIndex(entry.oldIndex);
	}
	return humanIndex(entry.newIndex);
}

function StepDiffRow({ entry }: { entry: StepDiffEntry }) {
	const meta = STEP_KIND_META[entry.kind];
	return (
		<TableRow>
			<TableCell className="align-top">
				<Badge className={meta.badgeClass} variant="outline">
					{meta.label}
				</Badge>
			</TableCell>
			<TableCell className="align-top text-muted-foreground">
				{orderLabel(entry)}
			</TableCell>
			<TableCell className="w-1/2 min-w-0 whitespace-normal align-top">
				<StepTextCell entry={entry} field="step" />
			</TableCell>
			<TableCell className="w-1/2 min-w-0 whitespace-normal align-top">
				<StepTextCell entry={entry} field="expected" />
			</TableCell>
		</TableRow>
	);
}

function StepCountsSummary({ steps }: { steps: StepsDiff }) {
	const parts = KIND_ORDER.filter((kind) => steps.counts[kind] > 0).map(
		(kind) => ({ count: steps.counts[kind], kind, meta: STEP_KIND_META[kind] })
	);
	if (parts.length === 0) {
		return <span className="text-muted-foreground text-xs">无步骤</span>;
	}
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{parts.map((part) => (
				<Badge
					className={part.meta.badgeClass}
					key={part.kind}
					variant="outline"
				>
					{part.meta.label} {part.count}
				</Badge>
			))}
		</div>
	);
}

export function VersionDiffSteps({ steps }: { steps: StepsDiff }) {
	return (
		<section className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h4 className="font-medium text-muted-foreground text-xs">步骤</h4>
				<StepCountsSummary steps={steps} />
			</div>
			{steps.entries.length === 0 ? (
				<p className="text-muted-foreground text-xs">两个版本都没有步骤。</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>状态</TableHead>
							<TableHead>序号</TableHead>
							<TableHead>步骤</TableHead>
							<TableHead>预期结果</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{steps.entries.map((entry) => (
							<StepDiffRow entry={entry} key={entry.id} />
						))}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
