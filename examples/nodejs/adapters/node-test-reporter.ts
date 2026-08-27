/**
 * 切面之一：node:test 的**官方扩展位** `--test-reporter`。
 *
 *   node --test --test-reporter=./adapters/node-test-reporter.ts tests/node/
 *
 * node:test 规定自定义 reporter 的默认导出是一个「能被 stream.compose 接受的东西」，
 * 最省事的形状就是下面这个异步生成器：它拿到整条事件流，`yield` 出去的字符串
 * 会被写进 `--test-reporter-destination`。我们一个字都不 yield——终端上的
 * 测试进度交给 `spec` reporter 去打，这一位只负责把结果搬给 SDK。
 *
 * ⚠️ **测试文件里没有任何一行提到 SDK。** 它们只是普通的 `node:test` 用例，
 * 标题里方括号包着 sourceRef。谁在收它们的结果、往哪报，测试文件不知道也不需要知道。
 *
 * ⚠️ 生成器**返回之前**这条 pipeline 不会结束，node 的进程也就不会退——
 * 所以 `await reportRun(...)` 放在 `for await` 之后是安全的，不需要额外挂钩子。
 */

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

/**
 * node:test 把「跳过」也报成 `test:pass`，只是 `data.skip` 有值——
 * 照着事件类型直译会把跳过的用例记成通过，那是**在报告里编数据**：
 * 通过率的分母只算 passed + failed，跳过被算成通过会让分子分母一起虚高。
 */
function toResult(
	type: "test:fail" | "test:pass",
	data: PassOrFailData
): AutomationCaseResult {
	if (type === "test:fail") {
		return "failed";
	}
	return data.skip || data.todo ? "skipped" : "passed";
}

/**
 * 失败信息取 `error.message` 而不是整个堆栈：它落进 `test_run_cases.comment`，
 * 是失败清单上给人一眼扫的一行。完整堆栈随 `log` 附件走。
 */
function toMessage(data: PassOrFailData): string | null {
	const error = data.details?.error;
	if (!error) {
		return null;
	}
	return typeof error.message === "string" ? error.message : String(error);
}

/**
 * 一条事件 → 一条结果。取不到 sourceRef 时返回 null，整条丢掉：
 * 事件流里混着文件级的汇总事件（名字就是文件路径），一并报上去会在对账单上
 * 凭空多出一批「未匹配」，真正的拼写错误就被淹没在里面了。
 */
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
			// 失败现场在这里落盘，而不是在测试文件里手写 try/catch——
			// 「失败就留现场」是切面的职责，测试文件不该为它写一行代码。
			await saveFailureScene({
				framework: FRAMEWORK,
				log: data.details?.error?.stack ?? result.message ?? "（没有堆栈）",
				sourceRef: result.sourceRef,
			});
		}
	}
	await reportRun({ failedSourceRefs, framework: FRAMEWORK, results });
	// 一个字都不 yield：终端上的进度由默认 reporter 打，这一位只做上报。
}
