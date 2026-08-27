/**
 * 切面之二：vitest 的**官方扩展位** `reporters: []`（见 `vitest.config.ts`）。
 *
 * vitest 4 的 reporter 接口是一组可选钩子，全部允许返回 promise 并且**会被 await**。
 * 这里只用两个：
 * - `onTestCaseResult(testCase)`：一条用例跑完（含 hooks），此刻 `result()` 一定不是 pending；
 * - `onTestRunEnd()`：整轮结束，在这里做**唯一一次** `finish()`。
 *
 * ⚠️ **测试文件里没有任何一行提到 SDK。** 它们是普通的 vitest 用例，
 * 标题里方括号包着 sourceRef；`vitest.config.ts` 里那一行 `reporters` 才是接口。
 *
 * ⚠️ vitest 默认把用例跑在 worker 线程里，但 **reporter 跑在主进程**，
 * 拿到的是已经汇总回来的 `TestCase`——所以这里不需要 wdio 那套落盘汇聚。
 * 这正是「三个框架各自的扩展位长得不一样」的具体表现，也是为什么搬运代码
 * 该留在用户仓库里而不是塞进 SDK。
 */

import type {
	AutomationCaseResult,
	CaseResultInput,
} from "@automationstack/sdk";
// `TestCase` 只从 `vitest/node` 导出（`vitest/reporters` 那个入口没有它）。
import type { TestCase } from "vitest/node";
import type { Reporter } from "vitest/reporters";

import {
	resetFailureScenes,
	saveFailureScene,
} from "../src/failure-artifacts.ts";
import { reportRun } from "../src/report-run.ts";
import { extractSourceRef } from "../src/source-ref.ts";

const FRAMEWORK = "vitest";

/**
 * vitest 的 `state` 有四种，`pending` 在 `onTestCaseResult` 里不会出现。
 * `skipped` 单独立一档，不能并进 `passed`——跳过被算成通过会让通过率虚高。
 */
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
		// 用 fullName（含父级 describe）而不是 name：sourceRef 允许标在 describe 上，
		// 只看 name 会漏掉那种写法。取不到就整条跳过，免得整批进 unmatchedCases。
		const sourceRef = extractSourceRef(testCase.fullName);
		if (!sourceRef) {
			return;
		}
		const outcome = testCase.result();
		const result = toResult(outcome.state);
		const error = outcome.errors?.[0];
		this.results.push({
			durationMs: Math.round(testCase.diagnostic()?.duration ?? 0),
			// 只取一行进 comment，完整堆栈随 log 附件走。
			message: error?.message ?? null,
			result,
			sourceRef,
		});
		if (result === "failed") {
			this.failedSourceRefs.push(sourceRef);
			// 失败就留现场，这件事是切面的职责，测试文件不该为它写一行代码。
			await saveFailureScene({
				framework: FRAMEWORK,
				log: (outcome.errors ?? [])
					.map((entry) => entry.stack ?? entry.message)
					.join("\n\n"),
				sourceRef,
			});
		}
	}

	/** 整轮结束才发，一次。vitest 会 await 这个 promise。 */
	onTestRunEnd(): Promise<void> {
		return reportRun({
			failedSourceRefs: this.failedSourceRefs,
			framework: FRAMEWORK,
			results: this.results,
		});
	}
}
