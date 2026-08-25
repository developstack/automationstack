/**
 * 四条 ingest 端点的 URL。**这是 `apps/server/src/ingest/route-paths.ts` 的副本**。
 *
 * 为什么是副本而不是 import：本包要发到 npm，运行时依赖 `@automationstack/api`
 * 或 `apps/server` 是不成立的（那两个包各自拖着 drizzle、orpc、aws-sdk，
 * 而 SDK 的卖点之一就是零运行时依赖，§7.3「谁都不用引 AWS SDK」是同一条理由）。
 * 副本的代价是「两处可能分叉」，那件事由 `contract-parity.test.ts` 兜底：
 * 它把服务端那份文件当文本读进来逐条比对，改了一边而没改另一边，测试立刻红。
 *
 * ⚠️ `INGEST_RUNS_ROUTE` 在本包里**刻意没有任何调用方**（§7.2 第 5 条）：
 * 正常路径只有一次 `POST /ingest/executions`，`GET /ingest/runs` 是留给人
 * 排查用的。常量留在这里是为了让副本与服务端那份一一对齐（少一条就比不出差异），
 * 「没人调它」这件事由 `no-preflight.test.ts` 扫源码守着。
 */
export const INGEST_ATTACHMENTS_PRESIGN_ROUTE = "/ingest/attachments/presign";
export const INGEST_ATTACHMENTS_REGISTER_ROUTE = "/ingest/attachments/register";
export const INGEST_EXECUTIONS_ROUTE = "/ingest/executions";
export const INGEST_RUNS_ROUTE = "/ingest/runs";
