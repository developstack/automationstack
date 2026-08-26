package org.automationstack.sdk;

/**
 * 四条 ingest 端点的 URL。**这是 {@code apps/server/src/ingest/route-paths.ts} 的副本**。
 *
 * <p>为什么是副本而不是从服务端取：本包要发到 GitHub Packages，运行时依赖服务端那个
 * TypeScript 包是不成立的（Java 根本 import 不了 .ts，何况那边拖着 drizzle、orpc、aws-sdk，
 * 而 SDK 的卖点之一就是零运行时依赖，§7.3「谁都不用引 AWS SDK」是同一条理由）。
 * 「构建时从 OpenAPI 生成」也否掉了：那要引一个代码生成器，还会让「读 SDK 源码就能
 * 看懂发的是什么」失效。结论与 Node / Python 两家一致——**三个 SDK 一律自带一份
 * 契约副本，一律用一致性测试兜底漂移**。Java 这边的闸是 {@code ContractParityTest}，
 * 它把 Node 版那两份 .ts 当文本读进来逐条比对。
 *
 * <p>⚠️ {@link #INGEST_RUNS_ROUTE} 在本包里**刻意没有任何调用方**（§7.2 第 5 条）：
 * 正常路径只有一次 {@code POST /ingest/executions}，{@code GET /ingest/runs} 是留给人
 * 排查用的。常量留在这里是为了让副本与服务端那份一一对齐（少一条就比不出差异），
 * 「没人调它」这件事由 {@code NoPreflightTest} 扫源码守着。
 */
public final class RoutePaths {

    public static final String INGEST_ATTACHMENTS_PRESIGN_ROUTE = "/ingest/attachments/presign";
    public static final String INGEST_ATTACHMENTS_REGISTER_ROUTE = "/ingest/attachments/register";
    public static final String INGEST_EXECUTIONS_ROUTE = "/ingest/executions";
    public static final String INGEST_RUNS_ROUTE = "/ingest/runs";

    private RoutePaths() {
    }
}
