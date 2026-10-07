import type {
	AutomationCaseResult,
	CaseResultInput,
} from "@automationstack/sdk";
import WDIOReporter, { type RunnerStats, type TestStats } from "@wdio/reporter";
import type { Reporters } from "@wdio/types";

import { extractSourceRef } from "../src/source-ref.ts";
import { writeSpooledRunner } from "../src/wdio-spool.ts";

function toResult(state: TestStats["state"]): AutomationCaseResult {
	if (state === "passed") {
		return "passed";
	}
	if (state === "failed") {
		return "failed";
	}
	return "skipped";
}

function toMessage(test: TestStats): string | null {
	return test.error?.message ?? test.errors?.[0]?.message ?? null;
}

export default class AutomationStackWdioReporter extends WDIOReporter {
	private pendingWrites = 0;

	constructor(options: Partial<Reporters.Options>) {
		super(Object.assign(options, { stdout: false }));
	}

	get isSynchronised(): boolean {
		return this.pendingWrites === 0;
	}

	onRunnerEnd(runner: RunnerStats): void {
		const results: CaseResultInput[] = [];
		const failedSourceRefs: string[] = [];
		for (const test of Object.values(this.tests)) {
			const sourceRef = extractSourceRef(test.title);
			if (!sourceRef) {
				continue;
			}
			const result = toResult(test.state);
			results.push({
				durationMs: Math.round(test.duration),
				message: toMessage(test),
				result,
				sourceRef,
			});
			if (result === "failed") {
				failedSourceRefs.push(sourceRef);
			}
		}
		this.pendingWrites += 1;
		writeSpooledRunner({
			cid: runner.cid,
			failedSourceRefs,
			results,
			specs: runner.specs,
		}).finally(() => {
			this.pendingWrites -= 1;
		});
	}
}
