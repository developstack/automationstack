/**
 * 切面之三（worker 侧）：WebdriverIO 的**官方扩展位** `reporters: []`。
 *
 * 这一位跑在**每个 worker 子进程**里，职责只有两件：攒结果、落一份 JSON。
 * **它绝不调 `finish()`**，理由见下面那段长注释。
 *
 * ⚠️ **测试文件（`tests/wdio/*.spec.ts`）里没有任何一行提到 SDK。**
 * 它们是普通的 mocha 用例，标题里方括号包着 sourceRef。
 *
 * ## 为什么这里必须实现 `isSynchronised`
 *
 * wdio 文档的原话（`node_modules/@wdio/reporter/README.md` 的 Synchronization 一节）：
 *
 * > If your reporter needs to do some async computation after the test
 * > (e.g. upload logs to a server) you can overwrite the `isSynchronised`
 * > getter method to manage this. By default this property always returns true
 * > as most of the reporters don't require to do any async work.
 *
 * > The wdio testrunner will wait to kill the runner process until every
 * > reporter has the `isSynchronised` property set to `true`.
 *
 * 也就是说：`onRunnerEnd` 的**返回值是被忽略的**（基类里就是
 * `this.onRunnerEnd(this.runnerStat)` 一句，没有 await）。把它写成
 * `async onRunnerEnd()` 而不实现 `isSynchronised`，
 * wdio 不会等——落盘写到一半进程就被杀掉，症状是「这一轮少了某个 worker 的结果」，
 * 而且**没有任何报错**：对账单照样打出来，只是条数悄悄少了一批。
 *
 * 所以计数器要在 `onRunnerEnd` 里**同步**加一（在任何 await 之前），
 * 异步写完再减回去；`isSynchronised` 就是「计数器归零了没有」。
 */

import type {
	AutomationCaseResult,
	CaseResultInput,
} from "@automationstack/sdk";
import WDIOReporter, { type RunnerStats, type TestStats } from "@wdio/reporter";
import type { Reporters } from "@wdio/types";

import { extractSourceRef } from "../src/source-ref.ts";
import { writeSpooledRunner } from "../src/wdio-spool.ts";

/**
 * `TestStats.state` 的四个取值（`stats/test.d.ts` 里就是这么声明的）：
 * `'pending' | 'passed' | 'skipped' | 'failed'`。
 * `pending` 是 mocha 里 `it.skip` 收集到但没跑的那种，对平台来说同样是「跳过」——
 * 但它不能并进 `passed`：跳过被算成通过会让通过率的分子分母一起虚高。
 */
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
	/** 未完成的落盘数。`isSynchronised` 就看它归没归零。 */
	private pendingWrites = 0;

	constructor(options: Partial<Reporters.Options>) {
		// stdout: false —— 这一位一个字都不往终端写，终端上的进度交给 spec reporter。
		super(Object.assign(options, { stdout: false }));
	}

	get isSynchronised(): boolean {
		return this.pendingWrites === 0;
	}

	/**
	 * 一个 worker 跑完自己那份 spec 时调一次。
	 *
	 * 结果直接从基类的 `this.tests` 里取，而不是自己在 `onTestEnd` 里攒：
	 * mocha 的 `it.skip` **不会**触发 `test:start` / `test:end`，只走 `test:pending`，
	 * 靠 `onTestEnd` 攒会把跳过的用例整条漏掉——而漏掉的表现是对账单上少一条，
	 * 不是报错。`this.tests` 是基类按 uid 收齐的那一份，四种状态都在里面。
	 */
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
				// `duration` 是 RunnableStats 上的公开 getter（`_duration` 是它的私有底座，
				// 别抄那个：私有字段随时会改，改了也没人通知你）。
				durationMs: Math.round(test.duration),
				message: toMessage(test),
				result,
				sourceRef,
			});
			if (result === "failed") {
				failedSourceRefs.push(sourceRef);
			}
		}
		// ⚠️ 同步加一，在任何 await 之前——见文件顶部。
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
