/**
 * 浏览器目录的管理端（phase4 §7）：Selenoid 的 `browsers.json` 进了数据库，
 * 这里是它的四条 CRUD。拆出来单独一个文件、再由 `./farm.ts` 挂成 `farm.browsers.*`，
 * 沿 `testRuns` 那套「一个大路由拆成几个 Procedures 对象」的惯例。
 *
 * ## 授权为什么是「读放开、写只给 admin」
 *
 * 目录是**平台级**资源（表上没有任何外键，理由见 `schema/farm-browsers.ts`），
 * 它不属于任何项目，所以这里没有 `requireProjectMember` 可挂。
 *
 * 写路径走 `adminProcedure`：改一个 tag 会立刻改变全平台后续会话跑在哪个镜像上。
 * 读路径只要 `protectedProcedure`——接入指南要当场告诉用户「平台现在有哪些版本
 * 可以填进 `browserVersion`」，那句话对每个要写脚本的人都得说得出口，锁进管理员
 * 后台等于让所有人靠猜。目录里没有任何敏感信息，镜像名对能开会话的人本就是公开的。
 *
 * `list` **含停用行**（仓储层的口径就是如此）：管理页要看见自己停过什么，
 * 接入指南则要把停用的那些显示成「已下线」而不是干脆不提——版本从列表里凭空消失，
 * 用户只会以为是自己记错了。谁该怎么显示由调用方决定，路由不替它筛。
 */

import {
	createBrowser,
	listBrowsers,
	removeBrowser,
	updateBrowser,
} from "@automationstack/db/repositories/farm-browser-repository";

import { adminProcedure, protectedProcedure } from "../index";
import {
	createFarmBrowserSchema,
	farmBrowserIdSchema,
	updateFarmBrowserSchema,
} from "../schemas/farm";

const browserErrors = {
	NOT_FOUND: {},
} as const;

export const farmBrowserProcedures = {
	/**
	 * 新增一行。`isDefault: true` 时旧的那条由仓储层在同一事务里降级——
	 * 「至多一条 default」是数据库的部分唯一索引，不是这里的判断。
	 *
	 * 撞 `(browser, version)` 唯一约束会以 500 冒出去。刻意不在这里先查一次再插：
	 * 那个「查完到插之间」的窗口正是两个管理员同时录同一个版本时会撞上的地方，
	 * 挡不住还多一次往返。目录一天改不了几次，真撞了看错误信息也认得出来。
	 */
	create: adminProcedure
		.input(createFarmBrowserSchema)
		.handler(({ input }) => createBrowser(input)),

	/** 平台级目录，登录即可读（含停用行）。理由见文件头。 */
	list: protectedProcedure.handler(() => listBrowsers()),

	/**
	 * 删目录行。**不影响任何历史会话**：`farm_sessions` 把 browser / version /
	 * image 三列全部快照了，与目录之间刻意没有外键。
	 *
	 * 日常该用的是 `update({ enabled: false })`——停用留得下「我们曾经提供过这个
	 * 版本」这个事实，删除留不下。这条是给「一开始就录错了」准备的，所以行不存在
	 * 也不报错，回 `{ ok: false }` 就够了：管理员点删除时想要的结果是「它没了」，
	 * 而它确实没了。
	 */
	remove: adminProcedure
		.input(farmBrowserIdSchema)
		.handler(async ({ input }) => ({ ok: await removeBrowser(input.id) })),

	/**
	 * 改镜像 / 停用 / 设默认。`browser` 与 `version` 改不了，理由见 schema 注释。
	 *
	 * 与 `remove` 相反，这里行不存在要 `NOT_FOUND`：管理员是在编辑一行他以为
	 * 存在的记录，静默返回 null 会让表单看起来保存成功了。
	 */
	update: adminProcedure
		.errors(browserErrors)
		.input(updateFarmBrowserSchema)
		.handler(async ({ errors, input }) => {
			const updated = await updateBrowser(input.id, input.patch);
			if (updated === null) {
				throw errors.NOT_FOUND({ message: "浏览器目录项不存在" });
			}
			return updated;
		}),
};
