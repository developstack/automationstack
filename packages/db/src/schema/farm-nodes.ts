/**
 * 实机节点（phase4 §12）：一台注册进来的执行机，是槽位的第二个来源。
 *
 * 容器与实机的差别一句话：**容器是用后即毁的资源，实机是租借-复位-归还的资源**。
 * 这张表登记的是「借给谁、能借几个」的那本账，**不是节点的实时状态**——真相在
 * farm 进程的内存注册表里（与 `farm_sessions` 同一条 D6 分工）。库里唯一沾实时的
 * 只有 `lastSeenAt`，它是给管理页算 online 用的近似值，不是调度判据。
 *
 * ## capabilities 落库了，但它是**给人看的副本**，不是调度判据
 *
 * 节点 agent 连上来会上报它这台机器真实能起哪些浏览器（名字、版本、起不来的还
 * 带一句为什么）。那份清单**随机器变化**：装了个新版 Chrome、拉了一个新镜像，
 * 重连即生效。**调度读的从来不是这一列**，而是 farm 进程内存注册表里那份活值
 * ——与 `lastSeenAt` 同一条 D6 分工，两边职责不换。
 *
 * 那为什么还要落一份：内存里那份**只在 farm 活着、且这台机器连着的时候存在**，
 * 而管理页要回答的是「这台机器上到底装了什么」，尤其是在它**掉线之后**——运维
 * 恰恰是那个时候最想知道它身上有什么。不落库的话，掉线的行就只剩名字和槽位数。
 *
 * 代价是这一列必然会过期（机器上装了新浏览器却没重连过）。缓解不是「定时刷」，
 * 是把过期这件事摆到台面上：`capabilitiesUpdatedAt` 与它同进同出，界面照着它说
 * 「探测于 X 分钟前」；觉得不对就按 `refreshRequestedAt` 那条重新探一次。
 *
 * ## 停用而不是删除
 *
 * `enabled: false` 让节点退出调度但留着行与凭据（机器搬机房、临时下架都属这类）。
 * `removeNode` 是给「一开始就录错了」准备的，与 `farm_browsers` 同一条规矩。
 *
 * ## 依赖方向
 *
 * 本表不引用任何其它表；`farm_sessions` 单向引用它。pgEnum 在模块求值期取值，
 * schema 之间一旦成环就直接炸在 TDZ 上（原委见 `test-run-attachments.ts` 顶部）。
 */

import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";
import {
	boolean,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { farmNodeBackendEnum } from "./farm-enums";

/**
 * 注册时没填就用它。2 而不是 1：一台开发机同时跑两条会话是常态（一条在跑、
 * 一条在起），默认 1 会让并发直接掉到串行，而管理员通常不知道该填几。
 * 真实上限由节点 agent 上报的 `maxSlots` 与这一列取小值，farm 那边判。
 */
export const FARM_NODE_DEFAULT_MAX_SLOTS = 2;

export const farmNodes = pgTable(
	"farm_nodes",
	{
		/** 见 `farm-enums.ts`：agent 用哪套本地机制拉起浏览器，决定复位纪律的强度。 */
		backend: farmNodeBackendEnum("backend").notNull(),
		/**
		 * 节点上报的能力清单（`nodeCapabilities`：按哪种后端探的、浏览器数组、
		 * 探测时刻）。**可空 = 从没上报过**，与「上报了但一个浏览器都没探到」
		 * 是两件事：前者该说「还没探测过」，后者该说「这台机器上没有浏览器」，
		 * 界面要分得开，所以刻意不给 `'{}'::jsonb` 之类的默认值。
		 *
		 * 形状 type-only import 自 `@automationstack/farm-node-protocol`——协议包
		 * 是节点与 farm 之间那份契约的唯一真相源，db 这边再复述一遍结构定义就是
		 * 给同一个形状开第二个改动点（依赖是 devDependency，照 browser-slots 引
		 * db 的先例：只借类型，运行时零依赖）。
		 */
		capabilities: jsonb("capabilities").$type<NodeCapabilities>(),
		/**
		 * 上面那一列是什么时候写进来的。**与 `capabilities` 同进同出**（写一列
		 * 必写另一列，见 `saveNodeCapabilities`）：单看一份浏览器列表，没有任何
		 * 线索能说明它是三分钟前探的还是三个月前探的，而这两种情况下运维该不该
		 * 信它是相反的。
		 *
		 * 它同时是「重新探测」那一下有没有生效的**唯一凭据**：界面按下按钮之后
		 * 就盯着这个时刻变没变（推导见 apps/web 的 farm-node-capabilities.tsx）。
		 */
		capabilitiesUpdatedAt: timestamp("capabilities_updated_at", {
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/**
		 * 停用的节点**不得被调度选中**，但仍出现在管理列表（管理员要看见自己停过
		 * 什么），过滤发生在仓储/调度层而不是这里——与 `farm_browsers.enabled` 同款。
		 * 停用不踢已在跑的会话：那些会话有自己的租约，让它们正常收尾。
		 */
		enabled: boolean("enabled").notNull().default(true),
		/**
		 * **应用侧生成，没有 `defaultRandom`**，与 `farm_sessions.id` 同风格：
		 * farm_* 这几张表的 id 一律由写入方先生成再插入。这里的具体好处是
		 * `createNode` 要在同一次返回里给出 id 与明文 token，而 token 的哈希是
		 * 拿 id 之外的东西算的——两样东西在同一个函数体里备齐，比「insert 完再
		 * 回读」少一次「如果插入没返回行怎么办」的分支。
		 */
		id: uuid("id").primaryKey(),
		/**
		 * 最后一次心跳的时刻。可空 = 从没连上来过（多半是 token 还没填进 agent），
		 * 与「连过但断了」是两件事，管理页要分开显示。
		 *
		 * **online 是算出来的，不是存出来的**：库里没有 `online` 布尔列，因为那样
		 * 就需要一个把它翻成 false 的定时任务，而那个任务挂掉时表现是「全部节点
		 * 永远在线」——没有任何地方会报错。用 `now() - lastSeenAt < 超时窗` 判定，
		 * 判据只有一份，且不依赖任何东西按时跑。
		 */
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
		/**
		 * 这台机器最多同时租出去几个槽位。是**上限而非承诺**：agent 上报的能力可能
		 * 更低（机器内存不够），farm 取两者的小值。
		 */
		maxSlots: integer("max_slots")
			.notNull()
			.default(FARM_NODE_DEFAULT_MAX_SLOTS),
		/**
		 * 人给机器起的名，如 `mac-mini-01`。**唯一**，因为它是运维在日志、告警、
		 * 会话列表里唯一认得出这台机器的东西——两台重名等于所有排查线索都要再问
		 * 一句「哪一台」。它不参与鉴权寻址（那是 `tokenHash` 的事），所以改名安全。
		 */
		name: text("name").notNull(),
		/**
		 * 「重新探测」的**意向标记**，与 `farm_sessions.killRequestedAt` 同一个模式：
		 * 控制面只落这一列，真正让 agent 重新探一遍的是 farm——它轮询
		 * `listRefreshRequestedNodeIds()`，对还连着的节点发一次 RPC，拿到结果调
		 * `saveNodeCapabilities` 时**顺手把这一列清空**。
		 *
		 * 为什么不是控制面直接喊那台机器：控制面与 farm 是两个进程、互不调用（D3），
		 * 而那条 WS 连接握在 farm 手里。落一个标志位是这条边界上唯一的传话方式。
		 *
		 * null = 没有待办；非空 = 下过令还没执行完，界面据此把按钮画成进行中。
		 * 重复下令保留第一次的时刻（`coalesce`，同 `requestKill`），「从下令到真的
		 * 探完花了多久」才查得出来。
		 *
		 * 节点掉线时这个标记会一直挂着，是刻意的：它上线后 farm 的下一拍就会消费
		 * 掉，等于「等它回来再探」。清空它的唯一方式是真的探过一次。
		 */
		refreshRequestedAt: timestamp("refresh_requested_at", {
			withTimezone: true,
		}),
		/**
		 * 节点凭据的 SHA-256 小写十六进制，**绝不存明文**。生成与哈希口径复用
		 * `src/farm-node-token.ts`（它又复用 `src/api-token.ts` 的随机源与哈希
		 * 函数）——凭据链路上只允许有一套字母表和一种摘要算法。
		 *
		 * 与 `api_tokens` 的差别只有两处，都是刻意的：
		 * - **没有 `prefix` 展示列**：节点靠 `name` 认，不需要拿明文的一段来认；
		 * - **没有 `revokedAt`**：节点凭据不吊销，只轮换（`rotateNodeToken` 覆盖
		 *   这一列，旧串当场失效）。一台机器只有一份凭据，留着一堆废凭据的历史
		 *   行没有任何人会去查。
		 */
		tokenHash: text("token_hash").notNull(),
	},
	(table) => [
		unique("farm_nodes_name_uq").on(table.name),
		// 鉴权路径（agent hello）就是拿哈希做等值查找，唯一约束顺带把索引建了。
		// 它同时是「同一份凭据绝不会在库里出现两行」的最后一道保险——真撞上了
		// 也是插入失败，而不是鉴权时掷骰子选一台机器。与 `api_tokens` 同款。
		unique("farm_nodes_token_hash_uq").on(table.tokenHash),
	]
);

export type FarmNode = typeof farmNodes.$inferSelect;
export type NewFarmNode = typeof farmNodes.$inferInsert;

/**
 * 可以安全离开 Postgres 的字段：**没有 `tokenHash`**。
 *
 * 与 `ApiTokenView` / `PublicUser` 同档，且同样是独立声明的接口 + 逐字段手工构造，
 * 刻意不用 `Omit<FarmNode, "tokenHash">`：后者在给表加新的敏感列时会静默地把它
 * 带出去，独立接口则会在字段对不上时编译期就报错。
 */
export interface FarmNodeView {
	backend: FarmNode["backend"];
	capabilities: NodeCapabilities | null;
	capabilitiesUpdatedAt: Date | null;
	createdAt: Date;
	enabled: boolean;
	id: string;
	lastSeenAt: Date | null;
	maxSlots: number;
	name: string;
	refreshRequestedAt: Date | null;
}

export function toFarmNodeView(row: FarmNode): FarmNodeView {
	return {
		backend: row.backend,
		capabilities: row.capabilities,
		capabilitiesUpdatedAt: row.capabilitiesUpdatedAt,
		createdAt: row.createdAt,
		enabled: row.enabled,
		id: row.id,
		lastSeenAt: row.lastSeenAt,
		maxSlots: row.maxSlots,
		name: row.name,
		refreshRequestedAt: row.refreshRequestedAt,
	};
}
