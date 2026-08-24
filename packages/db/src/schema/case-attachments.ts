/**
 * 用例正文里的贴图（前置条件 / 每个步骤格）。
 *
 * 与 `test_run_attachments` 是**两张表**而不是一张带可空外键的表：那张表的每条
 * 写路径都要过测试任务的 `submitted` 锁死守卫，而用例贴图没有任何等价状态；
 * 合表意味着每次查询都要带一个「这行到底挂在哪边」的判别列，两边的守卫也得
 * 在同一段代码里分叉。表结构相似不是合表的理由。
 *
 * 与 `test-run-attachments.ts` 同样是这条链路的**叶子**：只向上引用
 * `test_cases` / `users`，`schema/test-cases.ts` 绝不反向引用它。
 * 理由见 `test-run-attachments.ts` 顶部——pgEnum 在模块求值期取值，
 * schema 之间一旦成环就直接炸在 TDZ 上。
 *
 * ## ⚠️ 为什么这里没有、也不该有「孤儿对象清理」
 *
 * `case_versions.snapshot` 是全量 jsonb 快照，正文里的图片引用会被**冻进每一个
 * 历史版本**。因此「正文不再引用某张图 → 删掉 R2 对象」这条看起来天经地义的
 * 清理逻辑是**错的**：用户在 v4 删掉一段含图的文字，回看 v3 就会是一堆碎图，
 * 而版本历史的全部价值就是「回看当时到底写了什么」。
 *
 * 所以：**正文的编辑永远不触发任何对象删除**，孤儿对象是刻意接受的代价。
 * 真要 GC 就得扫这条用例的全部版本快照才能判定「所有版本都不再引用它」，
 * 一条用例几十个版本、每个快照都要解析正文——为几 KB 的图片付这个代价不划算。
 * 后来者请不要把这件事当成 bug「修掉」。
 *
 * `case_attachments` 的行随 `test_cases` 级联删除是可以的：用例都没了，
 * 它的历史版本也跟着没了，不存在「回看时碎图」的场景。但 R2 上的对象同样
 * **不做联动删除**（与 `test_run_attachments` 一致，见 `lib/r2.ts` 的文件头）。
 */

import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { testCases } from "./test-cases";
import { users } from "./users";

export const caseAttachments = pgTable(
	"case_attachments",
	{
		caseId: uuid("case_id")
			.notNull()
			.references(() => testCases.id, { onDelete: "cascade" }),
		/** `HeadObject` 读回的真实值，不是前端声明的值（见 router 的 register）。 */
		contentType: text("content_type").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		/**
		 * 上传时的原始文件名，**纯展示用**（正文里的图片渲染成 `alt` / hover 提示）。
		 *
		 * object key 规则是 `test-cases/{projectId}/{caseId}/{uuid}.{ext}`，
		 * 刻意不含原始文件名（防路径穿越，也避免中文/特殊字符进签名）。
		 *
		 * ⚠️ **绝不参与 key 生成，绝不用于任何文件系统路径或 URL 路径拼接。**
		 * 这是用户可控的字符串，一旦被拿去拼下载路径，上面特意绕开的那个洞就被
		 * 重新挖回来了。要寻址只有一条路：`storageKey`。
		 *
		 * 粘贴场景下浏览器给的剪贴板文件常常没有名字，前端会合成一个
		 * （如 `pasted-image.png`）——这一列因此几乎必然重复，**不具备任何唯一性**，
		 * 也不保证与 `storageKey` 有对应关系。
		 */
		fileName: text("file_name").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		/** 同 `contentType`：`HeadObject` 读回的真实字节数。 */
		sizeBytes: integer("size_bytes").notNull(),
		/**
		 * R2 object key，**不存完整 URL**：访问用的是 15 分钟短期签名 GET URL，
		 * 存下来的完整 URL 过几分钟就是死链，反而比没有更糟。
		 */
		storageKey: text("storage_key").notNull(),
	},
	/**
	 * 唯一的查询形状是「这条用例的全部贴图」——前端渲染正文时一次取全，
	 * 再按 id 在内存里查 URL（十张图发十次请求是这条链路最容易犯的错）。
	 */
	(table) => [index("case_attachments_case_id_idx").on(table.caseId)]
);

export type CaseAttachment = typeof caseAttachments.$inferSelect;
export type NewCaseAttachment = typeof caseAttachments.$inferInsert;
