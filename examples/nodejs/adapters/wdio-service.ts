/** biome-ignore-all lint/suspicious/noConsole: 这几行是「多进程确实汇聚上来了」的证据，必须打在终端上 */

/**
 * 切面之三（总控侧）：WebdriverIO 的**官方扩展位** launcher service。
 *
 * launcher service 跑在**总控进程**里，拿得到 `onPrepare` / `onComplete` 这两个
 * 一轮只发生一次的钩子。wdio 的类型声明（`@wdio/types` 的 `HookFunctions`）原话：
 *
 * > `onComplete?(exitCode, config, capabilities, results): unknown | Promise<unknown>`
 * > Gets executed after all workers got shut down and the process is about to exit.
 * > **An error thrown in the onComplete hook will result in the test run failing.**
 *
 * 而 CustomServices 文档那一句说的是等待语义：
 *
 * > **If a hook returns a promise, WebdriverIO will wait until that promise is
 * > resolved to continue.**
 *
 * 两条加起来正是我们要的：`onComplete` 返回的 promise 会被 await（所以那一次
 * `finish()` 一定发得完），而 `IngestEmptyWriteError` 抛出来会让整轮判失败。
 *
 * ## 为什么汇聚在这里，而不是「先建后发」
 *
 * BrowserStack 那类服务的做法是：总控先建一个 build，把 id 塞进环境变量，
 * 各 worker 各自往那个 build 上**追加**结果。**照抄到这里是灾难**：
 * ingest 的契约是「一轮只收一次总提交，不支持追加」，同一个幂等键第二次提交
 * 会命中第一次的缓存对账单原样返回——第 2 个往后的 worker 一条都写不进去，
 * 却各自收到一份看起来成功的对账单。绿的，什么都没发生。
 *
 * 所以：worker 只落盘（`adapters/wdio-reporter.ts`），总控在这里回捡、
 * 拼成一轮、调**唯一一次** `finish()`。
 */

import { basename } from "node:path";

import { resetFailureScenes } from "../src/failure-artifacts.ts";
import { reportRun } from "../src/report-run.ts";
import { readSpooledRunners, resetSpool } from "../src/wdio-spool.ts";

const FRAMEWORK = "wdio";

export default class AutomationStackLauncherService {
	/** 清掉上一轮的 spool 与失败现场：捡到残留就等于凭空多报一批结果。 */
	async onPrepare(): Promise<void> {
		await resetFailureScenes(FRAMEWORK);
		await resetSpool();
	}

	async onComplete(): Promise<void> {
		const spooled = await readSpooledRunners();
		const results = spooled.flatMap((runner) => runner.results);
		const failedSourceRefs = spooled.flatMap(
			(runner) => runner.failedSourceRefs
		);
		// 这三行是「多进程确实生效、且一条不漏」的**证据**：
		// spool 文件数 = 起了几个 worker，每个 worker 报了几条，合计多少条。
		// 只打一个总数的话，少了一个 worker 你是看不出来的。
		console.log(
			`[切面/${FRAMEWORK}] 回捡到 ${spooled.length} 份 spool（每份 = 一个 worker 子进程）：`
		);
		for (const runner of spooled) {
			console.log(
				`  cid ${runner.cid}  ${runner.results.length} 条  ${runner.specs.map((spec) => basename(spec)).join(", ")}`
			);
		}
		console.log(
			`[切面/${FRAMEWORK}] 合计 ${results.length} 条，汇成一轮，只发一次 POST`
		);
		await reportRun({ failedSourceRefs, framework: FRAMEWORK, results });
		// 上报成功才清。上面那句抛了就**故意留着**——那时候 spool 是唯一能回答
		// 「到底哪个 worker 的哪几条没发出去」的东西。
		await resetSpool();
	}
}
