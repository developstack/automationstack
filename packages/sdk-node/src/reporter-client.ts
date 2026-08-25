import { assertAttachmentInput, loadAttachments } from "./attachment-load.js";
import { uploadAttachments } from "./attachment-upload.js";
import {
	type ReporterConfig,
	type ReporterConfigInput,
	resolveReporterConfig,
} from "./config.js";
import type { IngestExecutionReceipt } from "./contract-types.js";
import { IngestEmptyWriteError } from "./errors.js";
import type { FetchLike } from "./http-client.js";
import { IngestHttpClient } from "./http-client.js";
import { hasNoWrites } from "./receipt-merge.js";
import { printReceipt, type ReceiptSink } from "./receipt-printer.js";
import type {
	AttachmentInput,
	AttachmentOutcome,
	CaseResultInput,
} from "./reporter-types.js";
import { submitExecution } from "./submit-execution.js";

/**
 * SDK 的**唯一**形态：一个框架无关的编程式入口。
 *
 * 本包不认识 wdio、playwright、mocha 或任何别的框架，`dependencies` 里一个
 * 框架包都没有。用户在自己的 reporter / hook / `afterAll` 里把框架给的对象搬成
 * `CaseResultInput`，那十几行搬运代码在**他的仓库里**——框架升级时改的是他那几行，
 * 不用等我们发版，我们也不会因为绑了某个框架的大版本而卡住别人。
 * README 里给了 wdio 与 playwright 的示例片段。
 *
 * 生命周期严格对应 §7.2 的五条铁律：
 * 1. `addResult` 只入内存缓冲，`finish()` 才发（缓冲后批量提交，D29）；
 * 2. 幂等键在**构造时**生成一次，之后所有批次都从它派生，重试复用；
 * 3. `finish()` 一定会把对账单原样打出来，`writtenTo` 逐任务一行；
 * 4. `writtenTo` 为空时抛 `IngestEmptyWriteError` 并置 `process.exitCode`；
 * 5. 全程不调 `GET /ingest/runs`，正常路径只有 `POST /ingest/executions`。
 */

export type ReporterClientOptions = ReporterConfigInput & {
	fetchImpl?: FetchLike;
	maxAttempts?: number;
	/** 对账单的输出去处。默认 `console.log`，测试里换成收集器。 */
	sink?: ReceiptSink;
	sleep?: (ms: number) => Promise<void>;
	startedAt?: Date;
	timeoutMs?: number;
};

export interface RunOutcome {
	/** 本轮没有附件时为 null。附件的成败**不影响**退出码（§5.6）。 */
	attachments: AttachmentOutcome | null;
	receipt: IngestExecutionReceipt;
}

export class AutomationStackReporter {
	private readonly attachmentQueue: AttachmentInput[] = [];
	private readonly client: IngestHttpClient;
	private readonly config: ReporterConfig;
	private readonly resultBuffer: CaseResultInput[] = [];
	private readonly sink: ReceiptSink | undefined;
	private readonly startedAt: Date;

	constructor(options: ReporterClientOptions = {}) {
		// 配置在构造时就解析并校验：缺 token 这种事必须在**跑测试之前**炸，
		// 而不是等跑完二十分钟才发现结果无处可去。
		this.config = resolveReporterConfig(options);
		this.client = new IngestHttpClient({
			baseUrl: this.config.baseUrl,
			fetchImpl: options.fetchImpl,
			maxAttempts: options.maxAttempts,
			sleep: options.sleep,
			timeoutMs: options.timeoutMs,
			token: this.config.token,
		});
		this.sink = options.sink;
		this.startedAt = options.startedAt ?? new Date();
	}

	/** 一次进程一个，重试复用（§7.2 第 2 条）。暴露出来是为了能打进日志。 */
	get idempotencyKey(): string {
		return this.config.idempotencyKey;
	}

	get pendingResultCount(): number {
		return this.resultBuffer.length;
	}

	/** 只入缓冲，**不发网络**。跑一条报一条既慢又碎（D29）。 */
	addResult(input: CaseResultInput): void {
		this.resultBuffer.push(input);
	}

	addResults(inputs: CaseResultInput[]): void {
		this.resultBuffer.push(...inputs);
	}

	/** 同样只入队；真正读盘在 `finish()`，几百张截图不必整轮驻留内存。 */
	addAttachment(input: AttachmentInput): void {
		assertAttachmentInput(input);
		this.attachmentQueue.push(input);
	}

	/**
	 * 攒完一整轮之后调一次。顺序是**先结论、后附件**：附件的 presign 要按
	 * sourceRef 解析到 run_case，而人看报告时最在意的是结论有没有进去。
	 *
	 * @throws {IngestEmptyWriteError} `writtenTo` 为空时（§7.2 第 4 条）。
	 */
	async finish(): Promise<RunOutcome> {
		const receipt = await this.submitResults();
		const attachments = await this.flushAttachments();
		printReceipt(receipt, attachments, this.sink);
		if (hasNoWrites(receipt)) {
			// 两条通道都堵上：抛异常（会被某些框架吞掉）**加**置退出码。
			// 静默成功是最坏的情况——QA 以为结果进去了，实际一条都没写。
			process.exitCode = 1;
			throw new IngestEmptyWriteError(receipt);
		}
		return { attachments, receipt };
	}

	private async submitResults(): Promise<IngestExecutionReceipt> {
		return await submitExecution({
			client: this.client,
			config: this.config,
			results: this.resultBuffer,
			window: { finishedAt: new Date(), startedAt: this.startedAt },
		});
	}

	private async flushAttachments(): Promise<AttachmentOutcome | null> {
		if (this.attachmentQueue.length === 0) {
			return null;
		}
		const { failures, loaded } = await loadAttachments(this.attachmentQueue);
		const outcome = await uploadAttachments({
			attachments: loaded,
			client: this.client,
			config: this.config,
		});
		outcome.rejections.unshift(...failures);
		return outcome;
	}
}
