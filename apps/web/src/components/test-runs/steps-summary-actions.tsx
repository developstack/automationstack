import { Button } from "@automationstack/ui/components/button";
import { CircleCheckBigIcon, RotateCcwIcon, SaveIcon } from "lucide-react";

import type { RunStepsSummaryProps } from "@/components/test-runs/run-steps-summary";

export function StepsSummaryActions({
	dirty,
	editing,
	actualResultMissing,
	onPassAll,
	onReset,
	onSave,
	saving,
}: Pick<
	RunStepsSummaryProps,
	"dirty" | "editing" | "onPassAll" | "onReset" | "onSave" | "saving"
> & {
	/** 还有失败或阻塞的步骤没有填写实际结果。 */
	actualResultMissing: boolean;
}) {
	if (!editing) {
		return null;
	}
	const saveBlocked = !dirty || saving || actualResultMissing;
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button onClick={onPassAll} size="sm" type="button" variant="outline">
				<CircleCheckBigIcon aria-hidden="true" data-icon="inline-start" />
				一键全部通过
			</Button>
			{dirty ? (
				<Button onClick={onReset} size="sm" type="button" variant="ghost">
					<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
					放弃改动
				</Button>
			) : null}
			<Button
				aria-disabled={saveBlocked || undefined}
				onClick={saveBlocked ? undefined : onSave}
				size="sm"
				type="button"
			>
				<SaveIcon aria-hidden="true" data-icon="inline-start" />
				{saving ? "保存中…" : "保存判定"}
			</Button>
		</div>
	);
}
