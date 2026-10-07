import { applyAutomationVerdicts } from "@automationstack/db/repositories/test-run-verdicts-repository";
import type { User } from "@automationstack/db/schema/users";

import type { RealtimeActor } from "../../realtime/protocol";
import { publishInvalidateAs } from "../realtime-publish";
import type {
	IngestOutOfScopeEntry,
	IngestSkippedManualEntry,
	IngestWrittenToEntry,
} from "./execution-contract";
import {
	type AutomationWriteGroup,
	buildGroupOutOfScopeEntries,
	buildSkippedManualEntries,
	buildWrittenToEntry,
	describeRunWriteRejection,
} from "./execution-reconcile";

export function ingestActor(user: User): RealtimeActor {
	return { clientId: "automation-ingest", name: user.username };
}

export interface WriteGroupsInput {
	actor: RealtimeActor;
	caseIdBySourceRef: Map<string, string>;
	executionId: string;
	groups: AutomationWriteGroup[];
	overwriteManual: boolean;
	projectId: string;
	userId: string;
}

export interface WriteGroupsOutput {
	outOfScope: IngestOutOfScopeEntry[];
	skippedManual: IngestSkippedManualEntry[];
	writtenTo: IngestWrittenToEntry[];
}

export async function writeGroups(
	input: WriteGroupsInput
): Promise<WriteGroupsOutput> {
	const outOfScope: IngestOutOfScopeEntry[] = [];
	const skippedManual: IngestSkippedManualEntry[] = [];
	const writtenTo: IngestWrittenToEntry[] = [];
	for (const group of input.groups) {
		// biome-ignore lint/performance/noAwaitInLoops: 每组一个事务，必须串行抢行锁，见上
		const outcome = await applyAutomationVerdicts({
			actorId: input.userId,
			executionId: input.executionId,
			items: group.items,
			overwriteManual: input.overwriteManual,
			runId: group.runId,
		});
		if (outcome.kind !== "ok") {
			outOfScope.push(
				...buildGroupOutOfScopeEntries(
					group,
					input.caseIdBySourceRef,
					describeRunWriteRejection(outcome, group.runName)
				)
			);
			continue;
		}
		skippedManual.push(
			...buildSkippedManualEntries(group, outcome.skippedRunCaseIds)
		);
		const entry = buildWrittenToEntry(group, outcome.updatedRunCaseIds.length);
		if (entry === null) {
			continue;
		}
		writtenTo.push(entry);
		publishInvalidateAs({
			action: "update",
			actor: input.actor,
			entity: "testRun",
			ids: [entry.runId],
			projectId: input.projectId,
		});
	}
	return { outOfScope, skippedManual, writtenTo };
}
