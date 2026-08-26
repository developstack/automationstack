package org.automationstack.sdk;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * SDK 的**唯一**形态：一个框架无关的编程式入口。
 *
 * <p>本包不认识 JUnit、TestNG、Cucumber 或任何别的框架，运行时依赖是零。用户
 * （或者 {@code org.automationstack.sdk.junit5} 那层薄壳）把框架给的对象搬成
 * {@link CaseResultInput}，那十几行搬运代码在**薄壳里或他自己的仓库里**——
 * 框架升级时改的是那几行，不用等我们发版，我们也不会因为绑了某个框架的大版本
 * 而卡住别人。
 *
 * <p>生命周期严格对应 §7.2 的五条铁律：
 * <ol>
 *   <li>{@link #addResult} 只入内存缓冲，{@link #finish()} 才发（缓冲后批量提交，D29）；</li>
 *   <li>幂等键在**构造时**生成一次，之后所有批次都从它派生，重试复用；</li>
 *   <li>{@link #finish()} 一定会把对账单原样打出来，{@code writtenTo} 逐任务一行；</li>
 *   <li>{@code writtenTo} 为空时抛 {@link IngestEmptyWriteError} 并在 {@link ExitSignal}
 *       上留记号（Java 上「让退出码非零」为什么只能这么做，见那个类的长注释）；</li>
 *   <li>全程不调 {@code GET /ingest/runs}，正常路径只有 {@code POST /ingest/executions}。</li>
 * </ol>
 *
 * <p>**线程安全**：{@link #addResult} / {@link #addAttachment} 用的是同步过的缓冲，
 * 因为 JUnit 5 的并行执行会从多个工作线程往里塞。{@link #finish()} 只该在收工时
 * 由一个线程调一次。
 */
public final class AutomationStackReporter {

    private final List<AttachmentInput> attachmentQueue = new ArrayList<>();
    private final IngestHttpClient client;
    private final ReporterConfig config;
    private final boolean markExitSignal;
    private final List<CaseResultInput> resultBuffer = new ArrayList<>();
    private final ReceiptSink sink;
    private final Instant startedAt;

    /** 配置全部从环境变量读（{@code AS_TOKEN} / {@code AS_PROJECT} / {@code AS_BASE_URL}）。 */
    public AutomationStackReporter() {
        this(builder());
    }

    private AutomationStackReporter(Builder builder) {
        // 配置在构造时就解析并校验：缺 token 这种事必须在**跑测试之前**炸，
        // 而不是等跑完二十分钟才发现结果无处可去。
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

    /** 一次进程一个，重试复用（§7.2 第 2 条）。暴露出来是为了能打进日志。 */
    public String idempotencyKey() {
        return config.idempotencyKey();
    }

    public int pendingResultCount() {
        synchronized (resultBuffer) {
            return resultBuffer.size();
        }
    }

    /** 只入缓冲，**不发网络**。跑一条报一条既慢又碎（D29）。 */
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

    /** 同样只入队；真正读盘在 {@link #finish()}，几百张截图不必整轮驻留内存。 */
    public void addAttachment(AttachmentInput input) {
        AttachmentLoad.assertAttachmentInput(input);
        synchronized (attachmentQueue) {
            attachmentQueue.add(input);
        }
    }

    /**
     * 攒完一整轮之后调一次。顺序是**先结论、后附件**：附件的 presign 要按 sourceRef
     * 解析到 run_case，而人看报告时最在意的是结论有没有进去。
     *
     * @throws IngestEmptyWriteError {@code writtenTo} 为空时（§7.2 第 4 条）。
     */
    public RunOutcome finish() {
        List<CaseResultInput> results;
        synchronized (resultBuffer) {
            results = List.copyOf(resultBuffer);
        }
        IngestExecutionReceipt receipt = SubmitExecution.submitExecution(
                client, config, results, new ExecutionWindow(startedAt, Instant.now()));
        AttachmentOutcome attachments = flushAttachments();
        // 对账单**先打再判**：抛出去之后调用方可能什么都不打，而人要看的正是它。
        ReceiptPrinter.printReceipt(receipt, attachments, sink);
        if (ReceiptMerge.hasNoWrites(receipt)) {
            // 两条通道都堵上：抛异常（会被某些框架吞掉）**加**留下进程级记号。
            // 静默成功是最坏的情况——QA 以为结果进去了，实际一条都没写。
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
        // 读盘失败排在服务端拒绝前面：那几条是本地问题，人先看到它才不会跑去平台上
        // 查一个根本没发出去的附件。
        outcome.prependRejections(loaded.failures());
        return outcome;
    }

    /** 配置项与客户端选项合在一个 builder 上。Java 没有对象字面量，只能这样。 */
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

        /** 已经有一份解析好的配置时直接给它，上面那些配置项一概忽略。 */
        public Builder config(ReporterConfig value) {
            this.config = value;
            return this;
        }

        /**
         * 传 false 就不去动 {@link ExitSignal} 那个进程级记号。
         *
         * <p>JUnit 薄壳传的就是 false：那边把失败翻译成一次**测试失败**，
         * 让 Surefire / Gradle 用自己的机制决定退出码，比进程级记号干净。
         */
        public Builder markExitSignal(boolean value) {
            this.markExitSignal = value;
            return this;
        }

        public Builder maxAttempts(int value) {
            this.maxAttempts = value;
            return this;
        }

        /** 对账单的输出去处。默认走 stdout，测试里换成收集器。 */
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

        /** 换掉网络层。测试里传一个假的，整个套件里就没有 socket。 */
        public Builder transport(Transport value) {
            this.transport = value;
            return this;
        }

        public AutomationStackReporter build() {
            return new AutomationStackReporter(this);
        }
    }
}
