/**
 * 一条会话录下来的东西（phase4 §4 / D12）：HAR、console 流、截图、容器日志。
 *
 * ## 为什么不复用 `test_run_attachments`
 *
 * 挂载点根本不同：那张表挂在 `test_run_cases` 上，每条写路径都要过测试任务的
 * `submitted` 锁死守卫；这张挂在会话上，没有任何等价状态，而且写入方是 farm 进程
 * 自己而不是人。合表就得给每行加一个「我到底挂在哪边」的判别列，两套守卫也得在
 * 同一段代码里分叉。表结构相似从来不是合表的理由。
 *
 * R2 的写入通道是**同一套**（`packages/api/src/lib/ingest/attachment-uploads.ts`），
 * 复用的是那个，不是这张表。
 *
 * ## 产物是「尽力而为」的
 *
 * 收尾流程**先释放容器、再异步组 HAR 与上传**（§5.2）：R2 抖动不得占用并发槽位。
 * 于是一条 `completed` 的会话完全可能一个产物行都没有（上传三次全失败，
 * `statusReason` 补记 `artifacts_upload_failed`）。详情页必须能显示「没有产物」，
 * 不能把空列表当成加载失败。
 *
 * 这条链路的叶子：只向上引用 `farm_sessions` 与 `farm-enums`，绝不被它们反向引用。
 */

import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { farmArtifactKindEnum } from "./farm-enums";
import { farmSessions } from "./farm-sessions";

export const farmSessionArtifacts = pgTable(
	"farm_session_artifacts",
	{
		/** 上传时实际写进 R2 的 content-type，决定详情页拿它当 JSON 渲染还是当图显示。 */
		contentType: text("content_type").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		kind: farmArtifactKindEnum("kind").notNull(),
		/**
		 * 产物自己的元信息，形状**按 `kind` 分**：HAR 记 entry 数，截图记尺寸与它
		 * 对应的导航时刻，`meta.storage` 记 `"r2" | "local"`（本地开发没配 R2 时
		 * 产物只落磁盘，这一列是详情页判断「这份能不能下载」的唯一依据）。
		 *
		 * 刻意不为这几种 kind 各开一列：它们两两不重叠，摊平就是一张全是 null 的宽表，
		 * 而每加一种产物类型都要一次迁移。db 层不给它类型——契约在读它的那一侧。
		 */
		meta: jsonb("meta"),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => farmSessions.id, { onDelete: "cascade" }),
		/** `HeadObject` 口径的真实字节数，不是上传前声明的值。 */
		sizeBytes: integer("size_bytes").notNull(),
		/**
		 * R2 object key，**不存完整 URL**：访问用的是 15 分钟短期签名 GET URL，
		 * 存下来的完整 URL 过几分钟就是死链，反而比没有更糟（与 `case_attachments`
		 * / `test_run_attachments` 同一条规矩）。
		 */
		storageKey: text("storage_key").notNull(),
	},
	// 唯一的查法：某条会话的全部产物，详情页一次取全。
	(table) => [
		index("farm_session_artifacts_session_id_idx").on(table.sessionId),
	]
);

export type FarmSessionArtifact = typeof farmSessionArtifacts.$inferSelect;
export type NewFarmSessionArtifact = typeof farmSessionArtifacts.$inferInsert;
