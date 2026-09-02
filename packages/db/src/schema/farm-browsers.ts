/**
 * 浏览器目录（phase4 §4）：Selenoid 的 `browsers.json` 进数据库。
 *
 * 换来的是一个管理 UI 和一条「改目录不用重启 farm」的路径——文件形态下加一个版本
 * 要登机器改文件再重启，而重启 farm 等于报废全部存量会话（farm 单副本，见 §11.4）。
 *
 * 这张表是**当前可用镜像的目录**，不是历史：`farm_sessions` 把 browser / version /
 * image 三列全部快照下来，正因为这里的行随时会被改、被删。目录改一个 tag 不该让
 * 三个月前那条会话看起来是用新镜像跑的。
 *
 * 表里没有任何外键：它不属于任何项目，是**平台级**资源（路由侧走 adminProcedure）。
 * 把它挂到项目上会立刻长出「A 项目能用 140、B 项目只能用 139」这种镜像分发问题，
 * 而镜像存在于宿主 daemon 上，本来就不是项目级的东西。
 */

import { sql } from "drizzle-orm";
import {
	boolean,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const farmBrowsers = pgTable(
	"farm_browsers",
	{
		/** 浏览器族。v1 只有 `chromium`（D1），留成 text 是因为 Phase E 要加的
		 * firefox / webkit 只是多几行数据，不该是一次枚举迁移。 */
		browser: text("browser").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/**
		 * 停用而不是删除：删掉行，历史会话里那个版本号就再也查不到对应镜像了。
		 * 停用的行仍然出现在管理列表（管理员要看见自己停过什么），但**调度不得选中**
		 * ——过滤发生在仓储层，不在这里。
		 */
		enabled: boolean("enabled").notNull().default(true),
		id: uuid("id").primaryKey().defaultRandom(),
		/** 完整镜像引用，如 `automationstack-browser-chromium:140`（§6 的 tag 约定）。 */
		image: text("image").notNull(),
		/**
		 * 客户端没指定 `browserVersion` 时选中的那一条。
		 *
		 * 「至多一条」由下面的**部分唯一索引**在数据库层保证，而不是靠写路径自觉：
		 * 两条 default 不会报错，只会让 `findDefaultBrowser` 每次随机挑一条，
		 * 于是同一份脚本今天跑 140、明天跑 139，而没有任何地方会提示这件事。
		 * 代价是置 default 必须先降级旧的那条（仓储层在同一事务里做）。
		 */
		isDefault: boolean("is_default").notNull().default(false),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		/**
		 * 大版本号字符串，如 `"140"`。**text 而非 integer**：客户端传来的
		 * `browserVersion` 本就是字符串，而 chromium 的版本一旦要精确到
		 * `140.0.7339` 就不是整数了，届时改列型比改比较逻辑贵得多。
		 * 代价是排序按字典序（`"9"` 排在 `"140"` 之后），目录页面对的是十几行数据，
		 * 不值得为此引入一个 parse 出来的排序列。
		 */
		version: text("version").notNull(),
	},
	(table) => [
		// 一个 (族, 版本) 只可能有一个镜像。调度按这两列查目录，唯一约束顺带建了索引。
		unique("farm_browsers_browser_version_uq").on(table.browser, table.version),
		// 全表至多一条 default——部分唯一索引是 Postgres 表达「至多一个」的唯一办法。
		uniqueIndex("farm_browsers_single_default_uq")
			.on(table.isDefault)
			.where(sql`${table.isDefault}`),
	]
);

export type FarmBrowser = typeof farmBrowsers.$inferSelect;
export type NewFarmBrowser = typeof farmBrowsers.$inferInsert;
