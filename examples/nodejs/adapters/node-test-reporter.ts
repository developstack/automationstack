import type { TestEvent } from "node:test/reporters";

import type {
	AutomationCaseResult,
	CaseResultInput,
} from "@automationstack/sdk";

import {
	resetFailureScenes,
	saveFailureScene,
} from "../src/failure-artifacts.ts";
import { reportRun } from "../src/report-run.ts";
import { extractSourceRef } from "../src/source-ref.ts";

const FRAMEWORK = "node-test";

interface PassOrFailData {
	details?: { duration_ms?: number; error?: Error };
	name?: string;
	skip?: boolean | string;
	todo?: boolean | string;
}

function toResult(
	type: "test:fail" | "test:pass",
	data: PassOrFailData
): AutomationCaseResult {
	if (type === "test:fail") {
		return "failed";
	}
	return data.skip || data.todo ? "skipped" : "passed";
}

function toMessage(data: PassOrFailData): string | null {
	const error = data.details?.error;
	if (!error) {
		return null;
	}
	return typeof error.message === "string" ? error.message : String(error);
}

function toCaseResult(
	type: "test:fail" | "test:pass",
	data: PassOrFailData
): CaseResultInput | null {
	const sourceRef = extractSourceRef(data.name);
	if (!sourceRef) {
		return null;
	}
	return {
		durationMs: Math.round(data.details?.duration_ms ?? 0),
		message: toMessage(data),
		result: toResult(type, data),
		sourceRef,
	};
}

// biome-ignore lint/correctness/useYield: node:test 的自定义 reporter 契约要的就是一个异步生成器；这一位一个字都不往终端写（进度交给同时挂着的 spec reporter），所以它没有 yield
export default async function* automationStackReporter(
	source: AsyncIterable<TestEvent>
): AsyncGenerator<string> {
	await resetFailureScenes(FRAMEWORK);
	const results: CaseResultInput[] = [];
	const failedSourceRefs: string[] = [];
	for await (const event of source) {
		if (event.type !== "test:pass" && event.type !== "test:fail") {
			continue;
		}
		const data = event.data as PassOrFailData;
		const result = toCaseResult(event.type, data);
		if (!result) {
			continue;
		}
		results.push(result);
		if (result.result === "failed") {
			failedSourceRefs.push(result.sourceRef);
			await saveFailureScene({
				framework: FRAMEWORK,
				log: data.details?.error?.stack ?? result.message ?? "（没有堆栈）",
				sourceRef: result.sourceRef,
			});
		}
	}
	await reportRun({ failedSourceRefs, framework: FRAMEWORK, results });
}
