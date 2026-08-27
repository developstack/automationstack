/** biome-ignore-all lint/suspicious/noConsole: 对账单与它旁边那几行说明就是这份示例的交付物 */

/**
 * **整份示例里唯一 `import` SDK 上报入口的地方。**
 *
 * 三个适配器（node:test / vitest / wdio）各自把框架给的对象搬成
 * `CaseResultInput`，然后都调这里的 `reportRun`。测试文件一个都碰不到它——
 * 这就是「切面」的落点：换框架时改的是 `adapters/` 下那十几行搬运代码，
 * 上报链路一个字不动；而测试文件从头到尾不知道有人在收它的结果。
 *
 * §7.2 那五条在这里各有一个落点：
 * 1. 缓冲后批量提交——`addResults` 只入内存，`finish()` 才发；
 * 2. 幂等键一次进程一个——`new AutomationStackReporter()` 时生成，下面打出来了；
 * 3. 对账单原样打印——`finish()` 内部打，本文件一个字都不改写、不概括；
 * 4. `writtenTo` 为空 → 非零退出——见下面的 catch；
 * 5. 不做预检——全程只有 `POST /ingest/executions`，从不调 `GET /ingest/runs`。
 */

import process from "node:process";

import {
	type AttachmentInput,
	AutomationStackReporter,
	type CaseResultInput,
	IngestEmptyWriteError,
} from "@automationstack/sdk";

import { collectFailureAttachments } from "./failure-artifacts.ts";

export interface RunReport {
	/** 直接给字节的附件（wdio 的真截图走这条）。不给就按 sourceRef 回捡磁盘。 */
	extraAttachments?: AttachmentInput[];
	/** 哪些 sourceRef 失败了——只有它们才回捡失败现场。 */
	failedSourceRefs: string[];
	/** 打印用的前缀，同时也是 `artifacts/<framework>/` 的目录名。 */
	framework: string;
	results: CaseResultInput[];
}

const RESULT_COLUMN_WIDTH = 7;

function printPending(run: RunReport): void {
	console.log(
		`[切面/${run.framework}] 本轮 ${run.results.length} 条结果（此刻一个请求都还没发）：`
	);
	for (const item of run.results) {
		const firstLine = item.message?.split("\n")[0];
		const tail = firstLine ? `  ${firstLine}` : "";
		console.log(
			`  ${item.result.padEnd(RESULT_COLUMN_WIDTH)} ${item.sourceRef}${tail}`
		);
	}
}

async function attachFailureScenes(
	reporter: AutomationStackReporter,
	run: RunReport
): Promise<void> {
	for (const attachment of run.extraAttachments ?? []) {
		reporter.addAttachment(attachment);
	}
	for (const sourceRef of run.failedSourceRefs) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐条回捡现场，一条缺文件不该带走整批
		const attachments = await collectFailureAttachments(
			run.framework,
			sourceRef
		);
		for (const attachment of attachments) {
			reporter.addAttachment(attachment);
		}
		console.log(
			`[切面/${run.framework}] ${sourceRef} 带 ${attachments.length} 个附件（截图 + 完整日志）`
		);
	}
}

/**
 * 一整轮攒完之后调**一次**。
 *
 * ⚠️ 「一次」是硬要求，不是风格问题：服务端 `UNIQUE (projectId, idempotencyKey)`
 * 是按请求判的，同一个键第二次提交会命中第一次的缓存对账单原样返回。
 * 谁要是在 wdio 的每个 worker 里各调一次，第 2 个往后的 worker 一条都写不进去，
 * 却各自收到一份「成功」的对账单——绿的，什么都没发生。
 * 所以 wdio 那条链路是 worker 落盘、总控汇聚（见 `adapters/wdio-service.ts`）。
 */
export async function reportRun(run: RunReport): Promise<void> {
	printPending(run);
	const reporter = new AutomationStackReporter();
	// 一次进程一个键；CI 重试要复用它（§7.2 第 2 条）——把 job/attempt 折成 UUID
	// 后喂进 AS_IDEMPOTENCY_KEY，见 ./ci-idempotency-key.ts（服务端只认合法 UUID）。
	console.log(`[切面/${run.framework}] 幂等键 ${reporter.idempotencyKey}`);
	reporter.addResults(run.results);
	await attachFailureScenes(reporter, run);
	console.log(
		`[切面/${run.framework}] 开始上报：${run.results.length} 条结果，一次 POST /ingest/executions`
	);
	try {
		await reporter.finish();
	} catch (error) {
		handleFinishError(run.framework, error);
		return;
	}
	console.log(`[切面/${run.framework}] 上报完成：至少写进了一个测试任务`);
}

/**
 * 两条通道都堵上。
 *
 * SDK 在 `writtenTo` 为空时已经把 `process.exitCode` 置成 1 了，这里**再置一次**
 * 不是多余：三个框架的 reporter 钩子跑完之后，框架自己还会按「测试有没有全过」
 * 写一次退出码。这个示例里有一条用例是**真的红**的，所以那条路上退出码本来
 * 也是 1；但如果哪天那条用例被修好，`writtenTo` 为空这件事仍然必须让进程非零退出——
 * 静默成功是最坏的情况，QA 以为结果进去了，实际一条都没写。
 */
function handleFinishError(framework: string, error: unknown): void {
	if (error instanceof IngestEmptyWriteError) {
		// SDK 已经把服务端逐条给的理由原样带在 message 里，这里照抄，不概括。
		console.error(`[切面/${framework}] 一条都没写进去：\n${error.message}`);
		console.error(`[切面/${framework}] 按 §7.2 第 4 条，进程以退出码 1 结束`);
		process.exitCode = 1;
		return;
	}
	console.error(`[切面/${framework}] 上报失败：`, error);
	process.exitCode = 1;
}
