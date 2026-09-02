import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "../index";
import { type FarmBrowser, farmBrowsers } from "../schema/farm-browsers";
import type { DbTransaction } from "./repository-types";

/**
 * 浏览器目录的读写（phase4 §4 / §7）。表本身的理由见 `schema/farm-browsers.ts`。
 *
 * 两类调用方，口径不同，别把它们混成一个函数：
 * - **调度**（`apps/farm`）按客户端请求的 browser/version 选镜像，要过 `enabled`；
 * - **管理 UI**（`packages/api` 的 adminProcedure）要看见全部行，包括停用的。
 *
 * 「至多一条 default」由数据库的部分唯一索引保证，因此每一条可能置 default 的写路径
 * 都必须在**同一个事务里先降级旧的那条**，否则第二次置 default 直接撞索引报错。
 */

export interface CreateFarmBrowserInput {
	browser: string;
	enabled?: boolean;
	image: string;
	isDefault?: boolean;
	version: string;
}

/**
 * 可改的只有这三项。**`browser` / `version` 不可改**：它们是调度的寻址键，
 * 改掉等于让「客户端请求 chromium/140」这件事悄悄指向另一个镜像，
 * 而 `farm_sessions` 里已经落下的快照还写着旧值。要换版本就新建一行再停用旧行——
 * 那样目录里留得下「我们曾经提供过 139」这个事实。
 */
export interface UpdateFarmBrowserInput {
	enabled?: boolean;
	image?: string;
	isDefault?: boolean;
}

/** `seeded` = 这次真的写进去了；`skipped` = 目录里已经有 default（或同 键 的行）。 */
export type EnsureDefaultBrowserResult =
	| { browser: FarmBrowser; kind: "seeded" }
	| { kind: "skipped" };

/**
 * 把除 `keepId` 之外的 default 全部降级。
 *
 * 用 UPDATE 而不是「先查出那条再按 id 改」：并发下前者由数据库一次判定，后者中间
 * 那个窗口正好是两个管理员同时点「设为默认」时会撞上的地方。
 */
function demoteOtherDefaultsInTx(
	tx: DbTransaction,
	keepId?: string
): Promise<unknown> {
	const isCurrentDefault = eq(farmBrowsers.isDefault, true);
	return tx
		.update(farmBrowsers)
		.set({ isDefault: false })
		.where(
			keepId
				? and(isCurrentDefault, ne(farmBrowsers.id, keepId))
				: isCurrentDefault
		);
}

async function findBrowserByIdInTx(
	tx: DbTransaction,
	id: string
): Promise<FarmBrowser | null> {
	const [row] = await tx
		.select()
		.from(farmBrowsers)
		.where(eq(farmBrowsers.id, id))
		.limit(1);
	return row ?? null;
}

/**
 * 全部目录行，**含停用的**——管理页要显示它们。调度侧别直接用这个函数的结果去选镜像。
 *
 * 排序按 (族, 版本) 字典序：`version` 是 text（理由见 schema），所以 `"9"` 会排在
 * `"140"` 后面。目录只有十几行，不值得为此引入一个 parse 出来的排序列。
 */
export function listBrowsers(): Promise<FarmBrowser[]> {
	return db
		.select()
		.from(farmBrowsers)
		.orderBy(asc(farmBrowsers.browser), asc(farmBrowsers.version));
}

/**
 * 按客户端请求的 (族, 版本) 取目录行。
 *
 * **不过滤 `enabled`**，是故意的：调用方需要能区分「平台没有这个版本」与
 * 「这个版本被管理员停用了」，两者给用户的话完全不同（后者该说「换个版本或找管理员」）。
 * 过滤掉之后这两种情况在调用方看来都是 null，那条信息就再也拿不回来了。
 * 调度路径拿到行之后自己判 `enabled`。
 */
export async function findBrowserByNameVersion(
	browser: string,
	version: string
): Promise<FarmBrowser | null> {
	const [row] = await db
		.select()
		.from(farmBrowsers)
		.where(
			and(eq(farmBrowsers.browser, browser), eq(farmBrowsers.version, version))
		)
		.limit(1);
	return row ?? null;
}

/**
 * 客户端没指定版本时用的那一条。
 *
 * 这里**要**过 `enabled`：停用的行不该被任何调度选中，而这个函数只有调度一个调用方。
 * 停用了唯一的 default 就会返回 null，让 create-session 明确失败——比静默地退回到
 * 另一个版本好得多，那种「怎么突然跑在 139 上了」的问题没人查得动。
 */
export async function findDefaultBrowser(): Promise<FarmBrowser | null> {
	const [row] = await db
		.select()
		.from(farmBrowsers)
		.where(
			and(eq(farmBrowsers.isDefault, true), eq(farmBrowsers.enabled, true))
		)
		.limit(1);
	return row ?? null;
}

export function createBrowser(
	input: CreateFarmBrowserInput
): Promise<FarmBrowser> {
	return db.transaction(async (tx) => {
		if (input.isDefault) {
			await demoteOtherDefaultsInTx(tx);
		}
		const [row] = await tx
			.insert(farmBrowsers)
			.values({
				browser: input.browser,
				enabled: input.enabled ?? true,
				image: input.image,
				isDefault: input.isDefault ?? false,
				version: input.version,
			})
			.returning();
		if (!row) {
			throw new Error("创建浏览器目录项失败：插入没有返回行");
		}
		return row;
	});
}

/**
 * 改目录行。返回 null = 行不存在。
 *
 * 置 default 时先降级旧的那条，两步在同一事务里：分开做的话，中间那一刻库里
 * 要么零条 default（调度当场失败），要么两条（撞部分唯一索引直接报错）。
 */
export function updateBrowser(
	id: string,
	patch: UpdateFarmBrowserInput
): Promise<FarmBrowser | null> {
	return db.transaction(async (tx) => {
		const set: UpdateFarmBrowserInput = {};
		if (patch.image !== undefined) {
			set.image = patch.image;
		}
		if (patch.enabled !== undefined) {
			set.enabled = patch.enabled;
		}
		if (patch.isDefault !== undefined) {
			set.isDefault = patch.isDefault;
		}
		if (Object.keys(set).length === 0) {
			return await findBrowserByIdInTx(tx, id);
		}
		if (patch.isDefault === true) {
			await demoteOtherDefaultsInTx(tx, id);
		}
		const [row] = await tx
			.update(farmBrowsers)
			.set(set)
			.where(eq(farmBrowsers.id, id))
			.returning();
		return row ?? null;
	});
}

/**
 * 删目录行。**不影响任何历史会话**：`farm_sessions` 把 browser / version / image
 * 三列全部快照了下来，与这张表之间刻意没有外键（见 `schema/farm-sessions.ts`）。
 *
 * 日常该用的是 `enabled: false`——停用留得下「我们曾经提供过这个版本」这个事实，
 * 删除留不下。这个函数是给「一开始就录错了」准备的。
 */
export async function removeBrowser(id: string): Promise<boolean> {
	const rows = await db
		.delete(farmBrowsers)
		.where(eq(farmBrowsers.id, id))
		.returning({ id: farmBrowsers.id });
	return rows.length > 0;
}

/**
 * farm 启动时调：目录里还没有 default 就播一条种子进去。幂等。
 *
 * 没有它，一台全新部署的平台在管理员手动录入目录之前，每一次 create-session 都会
 * 因为「找不到浏览器」失败——而错误信息指向的是目录，用户根本不知道要去哪里录。
 *
 * ## 为什么不是「先查空再插」
 *
 * farm 重启、多实例同时起来都是常态，而「先查后插」中间那个窗口正是它们会撞上的地方：
 * 两边都看见空目录，都插 default，第二条撞部分唯一索引，farm 直接起不来。
 * 这里改为**一条 `insert ... on conflict do nothing`**，把判定交给数据库的两条唯一索引：
 * - 撞 `(browser, version)` → 这行本来就有，不动它；
 * - 撞「至多一条 default」→ 目录里已经有默认了，不抢。
 *
 * 于是 `skipped` 的确切含义是「已经有人占了这两个位置之一」，而不只是「目录非空」。
 * 一个刻意接受的边角：如果种子这行已存在但被停用且不是 default，本函数不会把它
 * 重新扶正——管理员显式停用过的东西，启动流程无权推翻。
 */
export async function ensureDefaultBrowser(
	input: CreateFarmBrowserInput
): Promise<EnsureDefaultBrowserResult> {
	const [row] = await db
		.insert(farmBrowsers)
		.values({
			browser: input.browser,
			enabled: input.enabled ?? true,
			image: input.image,
			isDefault: true,
			version: input.version,
		})
		.onConflictDoNothing()
		.returning();
	return row ? { browser: row, kind: "seeded" } : { kind: "skipped" };
}
