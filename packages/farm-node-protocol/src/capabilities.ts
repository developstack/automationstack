import { z } from "zod";

/**
 * 「这台节点能提供什么浏览器」的形态。**唯一真相源**——farm、node-agent 与
 * `@automationstack/browser-slots` 三边共用这一份定义，谁都不许再声明一份自己的。
 *
 * ## 为什么模型要转成「节点是主体」（plan §12）
 *
 * 从前的方向是：farm 拿着目录行里的镜像 tag 去命令一台机器，机器自己猜它有没有
 * 这个浏览器。那个方向上有两个必然的失败：调度派完才知道派错了，而节点在
 * acquire 那一刻还得再猜一次「chromium:140 在我这儿是哪个二进制」。
 *
 * 现在的方向是：**机器先说「我有什么」，farm 按能力筛完之后把选择结果下发**
 * （`rpc.ts` 里 `acquireParams` 的 `browserName` / `browserVersion`）。上报与下发
 * 必须同时成立——只上报不下发，节点仍要猜；只下发不上报，farm 仍然是盲派。
 */

/** agent 能提供哪种槽位后端。与 `FARM_PROVIDER` 的取值同构。 */
export const nodeBackendSchema = z.enum(["local", "docker"]);
export type NodeBackend = z.infer<typeof nodeBackendSchema>;

/** 节点上的一个浏览器。**探到即上报**，能不能用由 `available` 说。 */
export const browserCapabilitySchema = z.object({
	/**
	 * 这条能力当下能不能真的接会话。
	 *
	 * 「探到但不可用」必须能表达出来，不能靠不上报：Safari 就在这一格里
	 * （D13 的三条硬伤），而运维在平台上看到「Safari：已装，但本期不支持，
	 * 原因是……」与什么都看不到，是两种完全不同的排查体验。
	 */
	available: z.boolean(),
	/**
	 * 这条能力在本机的**具体落地物**：local 后端是可执行文件的绝对路径，
	 * docker 后端是镜像 tag。拿不到就不带这一项——空串比缺失更难处理。
	 */
	bin: z.string().min(1).optional(),
	/** 发行通道（`stable` / `beta` / …）。同名不同通道的浏览器靠它分得开。 */
	channel: z.string().min(1).optional(),
	/** 浏览器名，小写。与目录行 `farm_browsers.browser` 是同一个词汇表。 */
	name: z.string().min(1),
	/** `available: false` 时的原因，一句人话，会原样进平台 UI 与日志。 */
	reason: z.string().min(1).optional(),
	/**
	 * 版本串。**可空**，与 `acquireParams.browserVersion` 同一个语义：读不出来
	 * （没有 `--version` 的浏览器）或本来就不限（镜像 tag 是 `latest`）时是 null，
	 * 而不是编一个 `"unknown"` 混进版本比较里——那种假值会在筛选那一步
	 * 变成一个匹配得上却根本不存在的版本。
	 */
	version: z.string().min(1).nullable(),
});
export type BrowserCapability = z.infer<typeof browserCapabilitySchema>;

/** 一次探测的完整结果。hello 带一份，`detectCapabilities` 现探现报一份。 */
export const nodeCapabilitiesSchema = z.object({
	/**
	 * 这份清单是**按哪种后端**探出来的：local 探本机二进制，docker 探已拉取镜像。
	 * 两者的浏览器清单可以完全不同，所以它必须跟着清单一起走，不能靠调用方记着。
	 */
	backend: nodeBackendSchema,
	/**
	 * 空数组是合法的：一台什么浏览器都没装的机器该如实这么说。把「没探到」
	 * 表达成「不上报这个字段」的话，farm 就分不清它是老版本 agent 还是真的空。
	 */
	browsers: z.array(browserCapabilitySchema),
	/** 探测时刻。让平台能把「这份清单是三天前的」画给运维看。 */
	detectedAtEpochSec: z.int().positive(),
});
export type NodeCapabilities = z.infer<typeof nodeCapabilitiesSchema>;
