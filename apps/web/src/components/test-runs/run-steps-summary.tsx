import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

import { StepsSummaryActions } from "@/components/test-runs/steps-summary-actions";
import {
	RESULT_BADGE_CLASSES,
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

export interface RunStepsSummaryProps {
	derived: TestRunCaseResult;
	dirty: boolean;
	editing: boolean;
	onPassAll: () => void;
	onReset: () => void;
	onSave: () => void;
	saving: boolean;
	unjudged: number;
}

function StepsSummaryText({
	derived,
	dirty,
	unjudged,
}: Pick<RunStepsSummaryProps, "derived" | "dirty" | "unjudged">) {
	const DerivedIcon = RESULT_ICONS[derived];
	return (
		<div className="flex flex-col gap-1">
			{dirty ? (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">保存后结论</span>
					<span
						className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${RESULT_BADGE_CLASSES[derived]}`}
					>
						<DerivedIcon aria-hidden="true" className="size-4" />
						{RESULT_LABELS[derived]}
					</span>
				</div>
			) : null}
			{unjudged > 0 ? (
				<p className="text-muted-foreground text-sm">
					还有 {unjudged} 步没判定，保存时会按「跳过」记录
				</p>
			) : null}
			{dirty ? (
				<p className="text-amber-600 text-sm dark:text-amber-400">
					有未保存的判定，已暂存在本机；刷新或重开页面还在，但只有点保存才进库
				</p>
			) : null}
		</div>
	);
}

export function RunStepsSummary({
	derived,
	dirty,
	editing,
	onPassAll,
	onReset,
	onSave,
	saving,
	unjudged,
}: RunStepsSummaryProps) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-3">
			<StepsSummaryText derived={derived} dirty={dirty} unjudged={unjudged} />
			<StepsSummaryActions
				dirty={dirty}
				editing={editing}
				onPassAll={onPassAll}
				onReset={onReset}
				onSave={onSave}
				saving={saving}
			/>
		</div>
	);
}
