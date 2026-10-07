/** biome-ignore-all lint/suspicious/noConsole: 对账单与它旁边那几行说明就是这份示例的交付物 */

import process from "node:process";

import {
	type AttachmentInput,
	AutomationStackReporter,
	type CaseResultInput,
	IngestEmptyWriteError,
} from "@automationstack/sdk";

import { collectFailureAttachments } from "./failure-artifacts.ts";

export interface RunReport {
	extraAttachments?: AttachmentInput[];
	failedSourceRefs: string[];
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

export async function reportRun(run: RunReport): Promise<void> {
	printPending(run);
	const reporter = new AutomationStackReporter();
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

function handleFinishError(framework: string, error: unknown): void {
	if (error instanceof IngestEmptyWriteError) {
		console.error(`[切面/${framework}] 一条都没写进去：\n${error.message}`);
		console.error(`[切面/${framework}] 按 §7.2 第 4 条，进程以退出码 1 结束`);
		process.exitCode = 1;
		return;
	}
	console.error(`[切面/${framework}] 上报失败：`, error);
	process.exitCode = 1;
}
