package org.automationstack.sdk;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class AutomationStackReporter {

    private final List<AttachmentInput> attachmentQueue = new ArrayList<>();
    private final IngestHttpClient client;
    private final ReporterConfig config;
    private final boolean markExitSignal;
    private final List<CaseResultInput> resultBuffer = new ArrayList<>();
    private final ReceiptSink sink;
    private final Instant startedAt;

    public AutomationStackReporter() {
        this(builder());
    }

    private AutomationStackReporter(Builder builder) {
        this.config = builder.config != null ? builder.config : ReporterConfig.resolve(builder.input);
        this.client = new IngestHttpClient(
                config.baseUrl(), config.token(), builder.transport,
                builder.maxAttempts, builder.timeout, builder.sleeper);
        this.markExitSignal = builder.markExitSignal;
        this.sink = builder.sink;
        this.startedAt = builder.startedAt != null ? builder.startedAt : Instant.now();
    }

    public static Builder builder() {
        return new Builder();
    }

    public String idempotencyKey() {
        return config.idempotencyKey();
    }

    public int pendingResultCount() {
        synchronized (resultBuffer) {
            return resultBuffer.size();
        }
    }

    public void addResult(CaseResultInput input) {
        synchronized (resultBuffer) {
            resultBuffer.add(input);
        }
    }

    public void addResults(List<CaseResultInput> inputs) {
        synchronized (resultBuffer) {
            resultBuffer.addAll(inputs);
        }
    }

    public void addAttachment(AttachmentInput input) {
        AttachmentLoad.assertAttachmentInput(input);
        synchronized (attachmentQueue) {
            attachmentQueue.add(input);
        }
    }

    public RunOutcome finish() {
        List<CaseResultInput> results;
        synchronized (resultBuffer) {
            results = List.copyOf(resultBuffer);
        }
        IngestExecutionReceipt receipt = SubmitExecution.submitExecution(
                client, config, results, new ExecutionWindow(startedAt, Instant.now()));
        AttachmentOutcome attachments = flushAttachments();
        ReceiptPrinter.printReceipt(receipt, attachments, sink);
        if (ReceiptMerge.hasNoWrites(receipt)) {
            if (markExitSignal) {
                ExitSignal.markFailure();
            }
            throw new IngestEmptyWriteError(receipt);
        }
        return new RunOutcome(attachments, receipt);
    }

    private AttachmentOutcome flushAttachments() {
        List<AttachmentInput> queued;
        synchronized (attachmentQueue) {
            if (attachmentQueue.isEmpty()) {
                return null;
            }
            queued = List.copyOf(attachmentQueue);
        }
        AttachmentLoad.LoadedAttachments loaded = AttachmentLoad.loadAttachments(queued);
        AttachmentOutcome outcome = AttachmentUpload.uploadAttachments(
                loaded.loaded(), client, config);
        outcome.prependRejections(loaded.failures());
        return outcome;
    }

    public static final class Builder {

        private final ReporterConfigInput input = new ReporterConfigInput();
        private ReporterConfig config;
        private boolean markExitSignal = true;
        private Integer maxAttempts;
        private ReceiptSink sink;
        private IngestHttpClient.Sleeper sleeper;
        private Instant startedAt;
        private Duration timeout;
        private Transport transport;

        private Builder() {
        }

        public Builder baseUrl(String value) {
            input.baseUrl(value);
            return this;
        }

        public Builder branch(String value) {
            input.branch(value);
            return this;
        }

        public Builder ciUrl(String value) {
            input.ciUrl(value);
            return this;
        }

        public Builder commitSha(String value) {
            input.commitSha(value);
            return this;
        }

        public Builder env(Map<String, String> value) {
            input.env(value);
            return this;
        }

        public Builder idempotencyKey(String value) {
            input.idempotencyKey(value);
            return this;
        }

        public Builder overwriteManual(boolean value) {
            input.overwriteManual(value);
            return this;
        }

        public Builder projectId(String value) {
            input.projectId(value);
            return this;
        }

        public Builder runIds(List<String> value) {
            input.runIds(value);
            return this;
        }

        public Builder token(String value) {
            input.token(value);
            return this;
        }

        public Builder config(ReporterConfig value) {
            this.config = value;
            return this;
        }

        public Builder markExitSignal(boolean value) {
            this.markExitSignal = value;
            return this;
        }

        public Builder maxAttempts(int value) {
            this.maxAttempts = value;
            return this;
        }

        public Builder sink(ReceiptSink value) {
            this.sink = value;
            return this;
        }

        public Builder sleeper(IngestHttpClient.Sleeper value) {
            this.sleeper = value;
            return this;
        }

        public Builder startedAt(Instant value) {
            this.startedAt = value;
            return this;
        }

        public Builder timeout(Duration value) {
            this.timeout = value;
            return this;
        }

        public Builder transport(Transport value) {
            this.transport = value;
            return this;
        }

        public AutomationStackReporter build() {
            return new AutomationStackReporter(this);
        }
    }
}
