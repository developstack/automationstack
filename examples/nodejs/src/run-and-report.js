/** biome-ignore-all lint/suspicious/noConsole: 示例的终端输出就是它的交付物 */

/**
 * 示例主入口：跑一轮 node:test，攒完一次性上报，原样打印对账单。
 *
 *   pnpm --filter @automationstack/example-nodejs report
 *
 * §7.2 那五条在这里各有一个落点：
 * 1. 缓冲后批量提交——`collectResults` 全程只入内存，`finish()` 才发；
 * 2. 幂等键一次进程一个——`new AutomationStackReporter()` 时生成，下面打出来了；
 * 3. 对账单原样打印——`finish()` 内部打，本文件一个字都不改写、不概括；
 * 4. `writtenTo` 为空 → 非零退出——见下面的 catch，以及 `report-empty-write.js`；
 * 5. 不做预检——全程只有一次 `POST /ingest/executions`，从不调 `GET /ingest/runs`。
 *
 * ⚠️ **本进程的退出码表达的是「结论有没有写进平台」，不是「测试有没有全过」。**
 * 示例里有一条用例是故意失败的（要用它演示附件），若把用例失败也算进退出码，
 * 这个示例每次都红，第 4 条那个「一条都没写进去」的信号就再也看不见了。
 * 真实 CI 里让 `node --test` 自己那一步去决定构建成败，上报是**另一件事**。
 */

import { join } from "node:path";
import { run } from "node:test";
import { fileURLToPath } from "node:url";

import {
	AutomationStackReporter,
	IngestEmptyWriteError,
} from "@automationstack/sdk";

import { collectFailureAttachments } from "./artifacts.js";
import { collectResults } from "./collect-results.js";

const EXAMPLE_ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const TEST_FILES = [join(EXAMPLE_ROOT, "tests", "checkout.test.js")];

/** 串行跑：示例要的是可复现的输出顺序，不是最快跑完。 */
const TEST_CONCURRENCY = 1;

function printResults(results) {
	console.log("[example] 本轮用例结果（还没有发出任何请求）：");
	for (const item of results) {
		const message = item.message ? `　${item.message.split("\n")[0]}` : "";
		console.log(`  ${item.result.padEnd(7)} ${item.sourceRef}${message}`);
	}
}

async function addFailureAttachments(reporter, failedSourceRefs) {
	for (const sourceRef of failedSourceRefs) {
		// biome-ignore lint/performance/noAwaitInLoops: 逐条回捡现场，一条缺文件不该带走整批
		const attachments = await collectFailureAttachments(sourceRef);
		for (const attachment of attachments) {
			reporter.addAttachment(attachment);
		}
		console.log(
			`[example] ${sourceRef} 带 ${attachments.length} 个附件（截图 + 完整日志）`
		);
	}
}

async function main() {
	const { failedSourceRefs, results } = await collectResults(
		run({ concurrency: TEST_CONCURRENCY, files: TEST_FILES })
	);
	printResults(results);
	const reporter = new AutomationStackReporter();
	// 一次进程一个键；CI 重试要复用它（§7.2 第 2 条）——把 job/attempt 折成 UUID
	// 后喂进 AS_IDEMPOTENCY_KEY，见 ./ci-idempotency-key.js（服务端只认合法 UUID）。
	console.log(`[example] 幂等键 ${reporter.idempotencyKey}`);
	reporter.addResults(results);
	await addFailureAttachments(reporter, failedSourceRefs);
	console.log(
		`[example] 开始上报：${results.length} 条结果，一次 POST /ingest/executions`
	);
	await reporter.finish();
	console.log("[example] 上报完成：至少写进了一个测试任务");
}

main().catch((error) => {
	if (error instanceof IngestEmptyWriteError) {
		// SDK 已经把服务端逐条给的理由带在 message 里，这里**原样打**，不概括。
		// process.exitCode 也已经被 SDK 置成 1，下面显式 exit 只是让它立刻生效。
		console.error(`[example] 一条都没写进去：\n${error.message}`);
		process.exit(1);
	}
	console.error(error);
	process.exit(1);
});
