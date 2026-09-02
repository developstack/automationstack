import { pgEnum } from "drizzle-orm/pg-core";

/**
 * 浏览器设备农场（phase4 §4 / §12）的**跨包共享词汇表**：四个 pgEnum 及其字面量类型。
 *
 * 与 `schema/test-run-enums.ts` 同一套分文件理由：枚举不引用任何表，表引用枚举，
 * 依赖方向单向，不构成模块循环（pgEnum 在模块求值期取值，schema 一旦成环就直接
 * 炸在 TDZ 上）。`apps/farm`、`packages/api`、`apps/web` 三边都要用这些字面量类型
 * 判分支，集中在这里是为了让「农场认识哪些状态」只有一份定义。
 */

/**
 * 会话走的是哪套协议（D1/D2）。
 *
 * 两者共享**同一个 chromium 镜像**，区别只在容器 entrypoint 的 `MODE` 与 farm
 * 这一侧的数据面实现：`webdriver` 是 HTTP 逐命令转发，`cdp` 是一条 WS 双向管道。
 * 记进库里是因为排查时第一个要问的就是「这条会话是 Selenium 还是 Playwright 开的」
 * ——两者的超时语义与收尾时机完全不同（CDP 不设空闲超时，见 plan §5.2）。
 *
 * 刻意不叫 `selenium` / `playwright`：库里记的是**线上协议**，而不是客户端框架。
 * 任何说 WebDriver 的客户端都能连进来，把框架名写进枚举等于第一天就记了假话。
 */
export const farmSessionProtocolEnum = pgEnum("farm_session_protocol", [
	"webdriver",
	"cdp",
]);

/**
 * 会话状态机（plan §5.2）。枚举顺序即生命周期顺序，新状态要追加在语义正确的位置。
 *
 * ```
 * starting ──acquire 失败/镜像不存在──▶ failed
 *    │ 容器探活通过
 *    ▼
 * running ──空闲超时 / 寿命上限──▶ finishing ──▶ timed_out
 *    │      ──客户端 DELETE / WS 关闭──▶ finishing ──▶ completed
 *    │      ──控制面 kill──────────────▶ finishing ──▶ killed
 * ```
 *
 * 后四个（`completed` / `failed` / `timed_out` / `killed`）是**终态**，进了就不再出去。
 * 终态集合的唯一定义在 `repositories/farm-session-status-core.ts`，写路径的守卫也只认
 * 那一份——判据散成两处，reaper 与正常收尾路径就会各按各的一套改同一行。
 *
 * `finishing` 是一个**必须存在的中间态**，不能省成「直接落终态」：收尾要截图、拉容器
 * 日志、向上游转发 DELETE，这段时间容器还活着、槽位还占着，而 reaper 每 60s 扫一次，
 * 没有这一格它就分不清「正在收尾」和「卡死的 running」，会把还在收尾的会话再杀一遍。
 *
 * 四个终态刻意分开而不是合成一个 `finished` + reason：会话列表默认要按「正常结束 /
 * 出错 / 超时 / 被杀」筛选与配色，塞进 `statusReason` 就得让每个读取方自己解析文本。
 * `statusReason` 承载的是**同一终态内部的细分**（`idle_timeout` / `orphaned` /
 * `client_disconnect` / `artifacts_upload_failed`），不是终态本身。
 */
export const farmSessionStatusEnum = pgEnum("farm_session_status", [
	"starting",
	"running",
	"finishing",
	"completed",
	"failed",
	"timed_out",
	"killed",
]);

/**
 * 会话产物的种类（D8）。
 *
 * - `har`：网络事件按 HAR 1.2 组装的整份 JSON，能被 Chrome DevTools 直接导入；
 * - `console`：console / 未捕获异常 / 浏览器级日志的 NDJSON 流；
 * - `screenshot`：导航锚点截图与收尾截图（穷人版 filmstrip，v1 没有视频）；
 * - `container_log`：容器 stdout/stderr（chromedriver 与 chromium 自身的日志），
 *   浏览器崩溃类问题基本只能靠它定位，所以它是产物而不是丢掉的调试输出；
 * - `client_trace`：**用户补传**的 Playwright 官方 trace。平台生成不了它（那是客户端
 *   能力），但收得下，所以枚举里先占位；没有它的话将来补传功能要连着改枚举与迁移。
 */
export const farmArtifactKindEnum = pgEnum("farm_artifact_kind", [
	"har",
	"console",
	"screenshot",
	"container_log",
	"client_trace",
]);

/**
 * 实机节点上，浏览器进程由谁拉起（plan §12）。
 *
 * - `local`：agent 直接在宿主机上起 chromedriver / chromium，每会话一个独立的
 *   临时 user-data-dir。这是「实机」的本义——机器上装的就是那一份浏览器。
 * - `docker`：agent 在这台机器**本地的** Docker daemon 上起容器。它与 farm 内建
 *   的容器 provider 长得像，但归属完全不同：镜像、磁盘、并发上限都在节点那一侧，
 *   farm 只下指令。把远端机器接进来扩容量，走的就是这一档。
 *
 * 这一列决定的是**复位纪律的强度**，所以必须记进库、必须让管理员在注册时选：
 * `docker` 的复位是销毁容器（与 farm 内建那条同样干净），`local` 的复位是
 * 「杀进程树 + 删临时 profile + 校验端口释放 + 健康探测」，任何一步没过都要把
 * 槽位标脏而不是归还。两者的失败面差一个数量级，运维看列表时第一眼要看的就是它。
 *
 * 刻意不叫 `native` / `container`：这一列答的是「agent 用哪套本地机制」，
 * `docker` 就是 docker，换成抽象词只会让排查时多一次翻译。
 */
export const farmNodeBackendEnum = pgEnum("farm_node_backend", [
	"local",
	"docker",
]);

export type FarmSessionProtocol =
	(typeof farmSessionProtocolEnum.enumValues)[number];
export type FarmSessionStatus =
	(typeof farmSessionStatusEnum.enumValues)[number];
export type FarmArtifactKind = (typeof farmArtifactKindEnum.enumValues)[number];
export type FarmNodeBackend = (typeof farmNodeBackendEnum.enumValues)[number];
