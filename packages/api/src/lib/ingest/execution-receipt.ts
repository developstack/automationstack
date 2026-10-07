import {
	findSubmittedRunBlockers,
	summarizeAutomationExecutionRuns,
} from "@automationstack/db/repositories/automation-ingest-repository";
import type { AutomationExecution } from "@automationstack/db/schema/automation-executions";

import {
	type IngestExecutionReceipt,
	ingestExecutionReceiptSchema,
} from "./execution-contract";
import {
	buildUnexplainedOutOfScopeEntries,
	type ReconciledAutomationTargets,
} from "./execution-reconcile";
import type { WriteGroupsOutput } from "./execution-verdict-writer";

export async function cachedReceipt(
	execution: AutomationExecution
): Promise<IngestExecutionReceipt> {
	const stored = ingestExecutionReceiptSchema.safeParse(execution.receipt);
	if (stored.success) {
		return stored.data;
	}
	return {
		executionId: execution.id,
		outOfScope: [],
		skippedManual: [],
		unmatchedCases: [],
		writtenTo: await summarizeAutomationExecutionRuns(execution.id),
	};
}

export interface BuildReceiptInput {
	executionId: string;
	projectId: string;
	reconciled: ReconciledAutomationTargets;
	written: WriteGroupsOutput;
}

export async function buildReceipt(
	input: BuildReceiptInput
): Promise<IngestExecutionReceipt> {
	const { reconciled, written } = input;
	const blockers = await findSubmittedRunBlockers({
		projectId: input.projectId,
		sourceRefs: reconciled.unexplained.map((entry) => entry.sourceRef),
	});
	return {
		executionId: input.executionId,
		outOfScope: [
			...reconciled.outOfScope,
			...buildUnexplainedOutOfScopeEntries(reconciled.unexplained, blockers),
			...written.outOfScope,
		],
		skippedManual: written.skippedManual,
		unmatchedCases: reconciled.unmatchedCases,
		writtenTo: written.writtenTo,
	};
}
