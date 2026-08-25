/**
 * 自动化上报四个端点的路由路径。
 *
 * 路径写在这里而不是从契约包里导入：`execution-contract.ts` 刻意只 import zod
 * （三种语言的 SDK 照着它发包，它必须能被单独读懂），没有导出路径常量。
 * 若日后契约里加了这几个常量，这里应改成导入。
 *
 * 四条摆在同一个文件里而不是各自跟着自己的注册函数走：它们是**一张对外的
 * URL 表**，SDK 那边就是照着这四行拼 URL 的；分散之后没有任何一处能一眼看全，
 * 改动时也就看不出「这条和另外三条不一致」。
 */
export const INGEST_ATTACHMENTS_PRESIGN_ROUTE = "/ingest/attachments/presign";
export const INGEST_ATTACHMENTS_REGISTER_ROUTE = "/ingest/attachments/register";
export const INGEST_EXECUTIONS_ROUTE = "/ingest/executions";
export const INGEST_RUNS_ROUTE = "/ingest/runs";
