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

export type ReporterClientOptions = ReporterConfigInput & {
	fetchImpl?: FetchLike;
	maxAttempts?: number;
	sink?: ReceiptSink;
	sleep?: (ms: number) => Promise<void>;
	startedAt?: Date;
	timeoutMs?: number;
};

export interface RunOutcome {
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

	get idempotencyKey(): string {
		return this.config.idempotencyKey;
	}

	get pendingResultCount(): number {
		return this.resultBuffer.length;
	}

	addResult(input: CaseResultInput): void {
		this.resultBuffer.push(input);
	}

	addResults(inputs: CaseResultInput[]): void {
		this.resultBuffer.push(...inputs);
	}

	addAttachment(input: AttachmentInput): void {
		assertAttachmentInput(input);
		this.attachmentQueue.push(input);
	}

	async finish(): Promise<RunOutcome> {
		const receipt = await this.submitResults();
		const attachments = await this.flushAttachments();
		printReceipt(receipt, attachments, this.sink);
		if (hasNoWrites(receipt)) {
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
