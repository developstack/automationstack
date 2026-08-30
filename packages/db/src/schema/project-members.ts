/**
 * 项目成员：本仓库第一份**项目级**授权数据。
 *
 * 在此之前 `projects` 表没有任何归属字段，成员关系推导不出来，于是
 * 「所有登录用户看到同一批项目」（那句话原本写在 `schema/users.ts` 顶上）。
 * 这张表就是那句话的替代品：一个人能看见一个项目，当且仅当这里有对应的行，
 * 或者他是平台 `admin`。
 *
 * ## 两档项目内角色
 *
 * - `owner`：能改项目、删项目、增删改本项目的成员
 * - `member`：项目内的业务数据照常读写，但碰不到上面那三件事
 *
 * 有 `owner` 这一档，「谁能加人」才有一个不依赖平台 admin 的答案——否则每加
 * 一个人都要去找管理员，而平台 admin 这个身份本来是给「成员管理」页用的，
 * 不该顺带变成所有项目的日常运维入口。平台 admin 仍然能管任何项目的成员，
 * 与 `adminProcedure` 的既有语义一致（见 `packages/api/src/index.ts`）。
 *
 * ## 主键与唯一性
 *
 * 跟仓库里另外 18 张表一样是单列 `uuid id`，不用 `(project_id, user_id)` 复合
 * 主键——一致性本身就是理由：所有 repository 的删除 / 定位路径都假设「一行有
 * 一个 id」。「同一个人在同一个项目里只有一行」由 `unique()` 表达，那条唯一
 * 索引顺带就是授权热路径（按 project + user 查角色）要的索引。
 *
 * ## onDelete
 *
 * 两个外键都是 `cascade`，但理由不同：
 *
 * - `project_id`：与 `modules` / `test_cases` 等所有 projects 子表同档，
 *   项目没了，它的成员名单不是任何东西。
 * - `user_id`：这是**授权记录**，与 `api_tokens.user_id` 同档而不是与
 *   `test_runs.submittedBy` 那类审计列同档。审计列走 `set null` 是因为 null
 *   承载语义（「提交人已不可考」仍是一份有效的报告）；一条指向空用户的成员
 *   记录不承载任何语义，只是一个谁都对不上号的授权洞。
 *
 * 账号的常规去路是**停用**（`users.disabledAt`）而不是删除，停用不动这张表，
 * 恢复账号即恢复他的全部项目——这也是 cascade 在这里代价很低的原因。
 *
 * ## 依赖方向
 *
 * 本表向上引用 `projects` 与 `users`，那两个文件绝不反向引用它：pgEnum 在模块
 * 求值期取值，schema 之间一旦成环就直接炸在 TDZ 上（原文见 `api-tokens.ts`）。
 */

import {
	index,
	pgEnum,
	pgTable,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";

export const projectRoleEnum = pgEnum("project_role", ["owner", "member"]);

export type ProjectRole = (typeof projectRoleEnum.enumValues)[number];

export const projectMembers = pgTable(
	"project_members",
	{
		/** 入组时间。成员列表按它排序，也是「谁是元老」的唯一线索。 */
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		/**
		 * 默认 `member`：加人这个动作的常见意图是「让他进来干活」，
		 * 而不是「把项目也交给他」。想给 owner 必须显式指定。
		 */
		role: projectRoleEnum("role").notNull().default("member"),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		// 「一个人在一个项目里只有一行」的执法者。它同时是授权热路径
		// （每次进项目都要查一次「我在这个项目里是什么角色」）的索引：
		// 前缀是 project_id，等值 + 等值刚好整条命中。
		unique("project_members_project_id_user_id_uq").on(
			table.projectId,
			table.userId
		),
		// 反向查法：「我属于哪些项目」——项目列表页每次加载都要走一遍。
		// 上面那条唯一索引的前缀是 project_id，帮不上按 user_id 起头的查询。
		index("project_members_user_id_idx").on(table.userId),
	]
);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
