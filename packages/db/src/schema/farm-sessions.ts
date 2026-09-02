/**
 * 一次浏览器会话 = 一个一次性容器（phase4 §4）。
 *
 * 这张表是**审计与 UI 的数据源，不是路由表**（D6）：sessionId → 容器端点的映射留在
 * farm 进程内存里，每条 WebDriver 命令都要查一次库是这条链路上最不能接受的开销。
 * 推论是这里的行**可能落后于真实状态**——farm 被 kill -9 之后，库里会留下一批
 * `running` 但容器早已不在的行，靠启动对账（`markOrphanedRunningSessions`）收敛。
 * 任何读取方都不得把这里的 `running` 当成「现在真的能连上」。
 *
 * ## 为什么 browser / version / image 三列全部快照
 *
 * `farm_browsers` 是可编辑的当前目录，行随时会被改 tag、被停用、被删。会话是历史，
 * 三个月后打开一条失败会话，要回答的是「它当时用的是哪个镜像」——外键 join 到目录
 * 只会给出今天的答案。同理这里**没有** `browserId` 外键：目录行被删不该让会话消失。
 *
 * ## 依赖方向
 *
 * 只向上引用 `projects` / `users` / `api_tokens` / `farm_nodes` / `farm-enums`，
 * 绝不反向被它们引用。
 * pgEnum 在模块求值期取值，schema 之间一旦成环就直接炸在 TDZ 上（原委见
 * `test-run-attachments.ts` 顶部）。
 */

import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { apiTokens } from "./api-tokens";
import { farmSessionProtocolEnum, farmSessionStatusEnum } from "./farm-enums";
import { farmNodes } from "./farm-nodes";
import { projects } from "./projects";
import { users } from "./users";

export const farmSessions = pgTable(
	"farm_sessions",
	{
		/**
		 * 开会话所用 token。`set null` 而非 cascade：吊销 token 只写 `revokedAt`
		 * 不删行，但**删账号会级联删掉它的全部 token**（见 `api-tokens.ts`），
		 * cascade 会让那些会话记录跟着一起消失。
		 * 它与 `userId` 不冗余：一个人有多枚 token，出事时要查的是「哪一枚在开会话」。
		 */
		apiTokenId: uuid("api_token_id").references(() => apiTokens.id, {
			onDelete: "set null",
		}),
		/** 快照，见文件头。如 `chromium`。 */
		browser: text("browser").notNull(),
		/**
		 * 宿主 daemon 上的容器 id。可空：`starting` 阶段 acquire 还没返回、
		 * 或者 acquire 本身就失败了（那一行会直接落 `failed`）。
		 * 存下来是为了让「库里这行 vs `docker ps` 里那个容器」能人工对上——
		 * reaper 判杀只凭容器 label，不依赖这一列（label 在 DB 挂掉时也还在）。
		 */
		containerId: text("container_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/**
		 * 预留给「这条会话属于哪次自动化执行」（Phase D：`as:options.executionId`）。
		 *
		 * 刻意是 **text 而不是指向 `automation_executions` 的外键**：Phase D 之前
		 * 归属语义还没定（一个会话对应一批 case 还是一条 case，见 §11.6），
		 * 现在焊一个外键上去，等于在语义定下来之前先替它选了「多对一」。
		 * 而且客户端传上来的值不保证是平台里存在的执行——外键会让一次拼错的
		 * `as:options` 直接把整个 create-session 打回，那是数据面不该有的失败方式。
		 */
		externalRef: text("external_ref"),
		/** 落终态的时刻。与 `statusReason` 同事务写入。 */
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		/**
		 * **对外的 platform sessionId，由 farm 生成后显式插入，没有 `defaultRandom`。**
		 *
		 * 理由是时序：WebDriver 的 create-session 响应里必须回填这个 id（farm 会把
		 * 上游 chromedriver 给的 sessionId 重写成它），而那一刻可能还没有数据库行——
		 * 交给 DB 默认值就等于「必须先 insert 才知道 id」，把一次同步的库写入焊进
		 * 数据面的关键路径上。farm 先生成 uuid、拿它建内存注册表、再落库，
		 * 库抖动最多让审计行迟到，不会让客户端拿不到会话。
		 */
		id: uuid("id").primaryKey(),
		/** 快照，见文件头。如 `automationstack-browser-chromium:140`。 */
		image: text("image").notNull(),
		/**
		 * 控制面强杀的**意向标记**，不是执行结果（§7）。
		 *
		 * 控制面（`packages/api`）与 farm 是两个进程，不互相 HTTP 调用：置这一列，
		 * farm 的 reaper 下一拍轮询到就执行，会话最终落 `killed`。v1 接受 ≤60s 延迟。
		 * 所以**非空只代表「有人要求杀」**，会话可能还在 `running`；判「杀完了没有」
		 * 要看 `status`。重复请求保留**第一次**的时刻（仓储层用 coalesce），
		 * 那样「从下令到真的杀掉花了多久」才是可查的。
		 */
		killRequestedAt: timestamp("kill_requested_at", { withTimezone: true }),
		/**
		 * 客户端可选传入的人类可读名（`as:options.name`）。纯展示，不参与任何寻址。
		 * 会话列表里十几行 uuid 谁也认不出来，这一列是唯一让人认出「哪条是我刚跑的」
		 * 的东西。
		 */
		label: text("label"),
		/**
		 * 这条会话跑在哪台实机节点上（plan §12）。**null = farm 内建的容器 provider**
		 * ——这是本列唯一的多态点，读取方必须对 null 有确定的展示，不许假设非空。
		 *
		 * `set null` 而非 cascade：注销一台机器不该让它跑过的会话连同录制产物一起
		 * 消失，那些记录本身仍是有效的排查材料（与 `userId` 同一条理由）。
		 * 代价是删节点之后老会话看起来像是内建 provider 跑的——为此列表页 join
		 * 出来的 `nodeName` 也是可空的，两处的 null 含义不同：这一列的 null 是
		 * 「不知道/内建」，join 结果的 null 只是「节点行没了」。
		 *
		 * 与 browser/version/image 三列的快照做法不同，这里**用了外键**：那三列
		 * 快照是因为目录行会被改 tag，而节点的身份（哪台机器）不会被改成另一台，
		 * 改的只是它的名字。要认「哪台机器」，外键是唯一不会随改名漂移的东西。
		 */
		nodeId: uuid("node_id").references(() => farmNodes.id, {
			onDelete: "set null",
		}),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		protocol: farmSessionProtocolEnum("protocol").notNull(),
		/**
		 * WebDriver 原始 capabilities，**剥除 `as:options` 之后**才存（D7）。
		 *
		 * ⚠️ `as:options` 里带着 `as_live_*` token 明文。这一列会被会话详情页原样
		 * 展示、也会进日志与错误上报——剥除必须发生在**入库之前**，不能指望读取方
		 * 记得脱敏。剥除的纯函数在 `apps/farm/src/wd/capabilities.ts`，那里有重点单测。
		 *
		 * CDP 会话恒为 null：那条路径的参数在 URL query 里，没有 caps 这个东西。
		 * db 层刻意不给它类型——形状由客户端决定，我们只负责原样存取。
		 */
		requestedCapabilities: jsonb("requested_capabilities"),
		/** 容器探活通过、可以接客的时刻。可空 = 还没起来，或压根没起来。 */
		startedAt: timestamp("started_at", { withTimezone: true }),
		status: farmSessionStatusEnum("status").notNull().default("starting"),
		/**
		 * 同一终态内部的细分原因：`idle_timeout` / `max_lifetime` / `orphaned` /
		 * `client_disconnect` / `image_not_found` / `artifacts_upload_failed` /
		 * `recorder_detached` …… 取值是**约定的 snake_case 短串**，不是给人读的句子：
		 * 会话列表要按它分组统计「最近一天有多少条是超时死的」。
		 * 面向用户的文案由 web 侧映射，别把中文写进这一列。
		 */
		statusReason: text("status_reason"),
		/**
		 * 开会话的人。`set null` 而非 cascade，理由与 `automation_executions.reportedBy`
		 * 一致：删账号不该让历史会话记录连同它的录制产物一起消失——记录本身仍是有效的
		 * 排查材料。可空的含义因此是「发起人已不可考」，读取方（列表页 join users）
		 * 必须对 null 有确定的展示，不许假设它非空。
		 */
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		/** 快照，见文件头。如 `140`。 */
		version: text("version").notNull(),
	},
	(table) => [
		// 会话列表页唯一的查法：某项目最近的会话，倒序 + 分页。
		index("farm_sessions_project_id_created_at_desc_idx").on(
			table.projectId,
			table.createdAt.desc()
		),
		// farm 侧两条高频查询都只按 status 过滤，且都是全局（不带 projectId）：
		// 配额闸门数在跑的会话，reaper 轮询待杀的会话。活跃行永远只有个位数
		// （`FARM_MAX_SESSIONS` 默认 8），这个索引真正的作用是让它们不必扫过
		// 越堆越多的历史终态行。
		index("farm_sessions_status_idx").on(table.status),
	]
);

export type FarmSession = typeof farmSessions.$inferSelect;
export type NewFarmSession = typeof farmSessions.$inferInsert;
