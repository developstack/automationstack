import type { NewTestRunCaseEvent } from "../schema/test-run-case-events";
import type { TestRunCaseResult } from "../schema/test-runs";
import { buildRunCaseEventRows } from "./test-run-case-events-core";
import { dedupe, type RunCaseVerdictSnapshotRow } from "./test-run-case-guards";

export interface AutomationVerdictItem {
	comment: string | null;
	result: TestRunCaseResult;
	runCaseId: string;
}

export interface AutomationTargetPartition {
	skippedRunCaseIds: string[];
	targets: AutomationVerdictItem[];
}

function isManualVerdict(snapshot: RunCaseVerdictSnapshotRow): boolean {
	return snapshot.executedVia === "manual" && snapshot.result !== "untested";
}

export function partitionAutomationTargets(
	items: AutomationVerdictItem[],
	snapshotById: Map<string, RunCaseVerdictSnapshotRow>,
	overwriteManual: boolean
): AutomationTargetPartition {
	const skippedRunCaseIds: string[] = [];
	const targets: AutomationVerdictItem[] = [];
	for (const item of items) {
		const snapshot = snapshotById.get(item.runCaseId);
		if (!overwriteManual && snapshot && isManualVerdict(snapshot)) {
			skippedRunCaseIds.push(item.runCaseId);
			continue;
		}
		targets.push(item);
	}
	return { skippedRunCaseIds, targets };
}

export function buildAutomationEventRows(
	actorId: string | null,
	items: AutomationVerdictItem[],
	snapshotById: Map<string, RunCaseVerdictSnapshotRow>
): NewTestRunCaseEvent[] {
	const groups = new Map<string, AutomationVerdictItem[]>();
	for (const item of items) {
		const key = JSON.stringify([item.result, item.comment]);
		const group = groups.get(key);
		if (group) {
			group.push(item);
			continue;
		}
		groups.set(key, [item]);
	}
	const rows: NewTestRunCaseEvent[] = [];
	for (const group of groups.values()) {
		const [first] = group;
		if (!first) {
			continue;
		}
		const snapshots: RunCaseVerdictSnapshotRow[] = [];
		for (const item of group) {
			const snapshot = snapshotById.get(item.runCaseId);
			if (snapshot) {
				snapshots.push(snapshot);
			}
		}
		rows.push(
			...buildRunCaseEventRows({
				actorId,
				automationTakeover: true,
				comment: first.comment,
				snapshots,
				toResult: first.result,
			})
		);
	}
	return rows;
}

export function assertAutomationVerdictItems(
	items: AutomationVerdictItem[]
): void {
	for (const item of items) {
		if (item.result === "untested") {
			throw new Error(
				"applyAutomationVerdicts: 自动化上报不能把结论写成 untested"
			);
		}
	}
	const ids = items.map((item) => item.runCaseId);
	const duplicatedRunCaseIds = dedupe(
		ids.filter((id, index) => ids.indexOf(id) !== index)
	);
	if (duplicatedRunCaseIds.length > 0) {
		throw new Error(
			`applyAutomationVerdicts: 同一批上报里出现重复 runCaseId：${duplicatedRunCaseIds.join(", ")}`
		);
	}
}
