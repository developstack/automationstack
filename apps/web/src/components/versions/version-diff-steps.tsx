import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";

import { CASE_TABLE_HEAD_CLASS } from "@/components/cases/case-table-layout";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";

import { CHANGE_KIND_LABELS, type ChangeKind } from "./change-kind.ts";
import type { StepsDiff } from "./step-diff.ts";
import { StepDiffRow } from "./step-diff-row.tsx";
import { VersionSection } from "./version-section.tsx";

const KIND_ORDER: readonly ChangeKind[] = [
	"added",
	"removed",
	"modified",
	"moved",
	"unchanged",
];

/** 各种变化的步骤数，例如「新增 1 · 修改 2」。 */
function StepCountsSummary({ steps }: { steps: StepsDiff }) {
	const parts = KIND_ORDER.filter((kind) => steps.counts[kind] > 0);
	if (parts.length === 0) {
		return null;
	}
	return (
		<p className="text-muted-foreground text-xs">
			{parts.map((kind, index) => (
				<span key={kind}>
					{index > 0 ? " · " : null}
					{CHANGE_KIND_LABELS[kind]}{" "}
					<span className="numeric">{steps.counts[kind]}</span>
				</span>
			))}
		</p>
	);
}

interface VersionDiffStepsProps {
	imageUrls: MarkdownImageUrls;
	steps: StepsDiff;
}

export function VersionDiffSteps({ imageUrls, steps }: VersionDiffStepsProps) {
	return (
		<VersionSection
			aside={<StepCountsSummary steps={steps} />}
			title="操作步骤"
		>
			{steps.entries.length === 0 ? (
				<p className="rounded-lg border border-dashed px-3 py-4 text-muted-foreground text-sm">
					两个版本都没有步骤。
				</p>
			) : (
				<div className="overflow-hidden rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className={cn(CASE_TABLE_HEAD_CLASS, "w-14 pl-3")}>
									#
								</TableHead>
								<TableHead className={cn(CASE_TABLE_HEAD_CLASS, "w-16")}>
									变化
								</TableHead>
								<TableHead className={CASE_TABLE_HEAD_CLASS}>
									操作步骤
								</TableHead>
								<TableHead className={CASE_TABLE_HEAD_CLASS}>
									预期结果
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{steps.entries.map((entry) => (
								<StepDiffRow
									entry={entry}
									imageUrls={imageUrls}
									key={entry.id}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</VersionSection>
	);
}
