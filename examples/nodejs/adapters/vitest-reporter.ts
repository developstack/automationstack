import type {
	AutomationCaseResult,
	CaseResultInput,
} from "@automationstack/sdk";
import type { TestCase } from "vitest/node";
import type { Reporter } from "vitest/reporters";

import {
	resetFailureScenes,
	saveFailureScene,
} from "../src/failure-artifacts.ts";
import { reportRun } from "../src/report-run.ts";
import { extractSourceRef } from "../src/source-ref.ts";

const FRAMEWORK = "vitest";

function toResult(state: string): AutomationCaseResult {
	if (state === "passed") {
		return "passed";
	}
	return state === "skipped" ? "skipped" : "failed";
}

export default class AutomationStackVitestReporter implements Reporter {
	private readonly failedSourceRefs: string[] = [];
	private readonly results: CaseResultInput[] = [];

	onTestRunStart(): Promise<void> {
		return resetFailureScenes(FRAMEWORK);
	}

	async onTestCaseResult(testCase: TestCase): Promise<void> {
		const sourceRef = extractSourceRef(testCase.fullName);
		if (!sourceRef) {
			return;
		}
		const outcome = testCase.result();
		const result = toResult(outcome.state);
		const error = outcome.errors?.[0];
		this.results.push({
			durationMs: Math.round(testCase.diagnostic()?.duration ?? 0),
			message: error?.message ?? null,
			result,
			sourceRef,
		});
		if (result === "failed") {
			this.failedSourceRefs.push(sourceRef);
			await saveFailureScene({
				framework: FRAMEWORK,
				log: (outcome.errors ?? [])
					.map((entry) => entry.stack ?? entry.message)
					.join("\n\n"),
				sourceRef,
			});
		}
	}

	onTestRunEnd(): Promise<void> {
		return reportRun({
			failedSourceRefs: this.failedSourceRefs,
			framework: FRAMEWORK,
			results: this.results,
		});
	}
}
