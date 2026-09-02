import { z } from "zod";

import { nodeCapabilitiesSchema } from "./capabilities";

/**
 * farm → node-agent 的 **RPC 载荷**（`control.ts` 里 `call` / `result` 两个信封
 * 的肚子）。
 *
 * 其中五个方法不是随手选的，它们是 `@automationstack/browser-slots` 的 `types.ts` 里 `SlotProvider`
 * 的**逐字投影**：`acquire` / `release`（对应 `AcquiredSlot.release`）/
 * `readLogs`（对应 `AcquiredSlot.readLogs`）/ `releaseContainer` / `listManaged`
 * （对应 `listManagedContainers`）。换句话说，实机节点这条路的实现就是
 * 「把 SlotProvider 的每个方法翻成一次 call」——不多一个也不少一个。少了任何一个
 * reaper 或收尾就会在实机上瘸掉，多出来的则说明有人把只对容器成立的东西
 * 漏进了抽象。
 *
 * 第六个方法 `detectCapabilities` 是**唯一的例外**，它不投影 `SlotProvider`：
 * 能力探测不是「开一个槽位」，它是节点这个主体自己的属性（`capabilities.ts`
 * 文件头的模型转向）。hello 里已经带了一份，这个方法存在的理由是那份会过期——
 * 运维在节点上装了个新浏览器、拉了个新镜像之后，需要一个「重新探测」按钮，
 * 而不是让人去重启 agent。
 *
 * ## 为什么槽位标识仍然叫 `containerId`
 *
 * 实机上没有容器。但 farm 侧的会话记录、reaper、收尾链路全都用这个词，
 * 在协议层另起一个 `slotId` 只会让两边各自维护一张翻译表，而翻译表迟早会错。
 * 这里的口径是：**它是「farm 手上那个能指回一个槽位的不透明串」**，
 * Docker 后端填容器 id，local 后端填槽位目录名（见 `@automationstack/browser-slots` 的 `local-slots.ts`）。
 * 协议不解释它，只搬运它。
 */

/** 槽位跑的是哪套协议。与 db 的 `farm_session_protocol` 同构，**必须逐字一致**。 */
export const slotModeSchema = z.enum(["webdriver", "cdp"]);
export type SlotMode = z.infer<typeof slotModeSchema>;

/** 端口号。0 不算：这里的端口永远是一个已经监听起来的具体端口。 */
const portSchema = z.int().min(1).max(65_535);

export const farmRpcMethodSchema = z.enum([
	"acquire",
	"detectCapabilities",
	"listManaged",
	"readLogs",
	"release",
	"releaseContainer",
]);
export type FarmRpcMethod = z.infer<typeof farmRpcMethodSchema>;

/**
 * 起一个槽位。
 *
 * ## 为什么浏览器要下发，而不是让节点自己挑
 *
 * 节点在 hello / `detectCapabilities` 里报过它有什么浏览器
 * （`capabilities.ts`），调度**按那份能力清单筛选**之后，仍然要把
 * **选择结果**原样下发下来。这两步缺一不可：筛完不下发，节点就得照着
 * 「chromium 大概是哪个」再猜一次，而它猜的规则与 farm 筛的规则是两份代码，
 * 分叉的那天没有任何一侧会报错——只会有一条会话安静地跑在了另一个浏览器上。
 * 所以纪律是：**节点不再自行猜测浏览器**，它只负责把下发的这个选择兑现，
 * 兑现不了就明说兑现不了。
 *
 * 浏览器怎么指定，取决于节点的后端，所以**三个字段一起下发**：
 * - local 后端按 `browserName` + `browserVersion` 去本机已装的浏览器里挑
 *   （即它自己上报过的那份 `browsers`），`browserVersion` 为 null 表示
 *   「哪个版本都行」，`image` 被忽略——与 `LocalProvider` 忽略
 *   `AcquireSlotInput.image` 同构；
 * - docker 后端要的是**镜像 tag**，而镜像的真相源是 farm 库里的
 *   `farm_browsers.image`（管理员填的那一列，可以是任意 registry 上的任意 tag）。
 *   不把它下发，节点就只能靠 `automationstack-browser-<name>:<version>` 这种命名
 *   约定去猜；约定与库里那一列一旦飘开，症状是节点上一句 `No such image`，
 *   而那句话既不指向管理员改过的那一行，也不指向猜错的那条规则。
 *
 * `expiresAtEpochSec` 要下发给 agent 而不是只留在 farm：plan §12 要求超时
 * 「两级各自强制」——网络分区时 agent 得能靠自己的计时把浏览器杀掉。
 */
export const acquireParamsSchema = z.object({
	browserName: z.string().min(1),
	browserVersion: z.string().min(1).nullable(),
	expiresAtEpochSec: z.int().positive(),
	/**
	 * 目录行里的镜像 tag，原样从 `AcquireSlotInput.image` 搬过来。
	 *
	 * **可以是 null**：local 后端的源，浏览器是本机探测出来的，镜像库
	 * （`farm_browsers`）里未必有对应的行——硬要凑一个 tag 下发，等于把一个
	 * 谁都不会用、还会与目录飘开的假事实塞进协议。所以 farm 只在 docker 后端的
	 * 源上从目录取 image，local 后端一律下 null，节点侧照 `LocalProvider`
	 * 忽略 `AcquireSlotInput.image` 的既有约定接着忽略它。
	 */
	image: z.string().min(1).nullable(),
	mode: slotModeSchema,
	sessionId: z.string().min(1),
});
export type AcquireParams = z.infer<typeof acquireParamsSchema>;

/**
 * 槽位起来了。
 *
 * **三个端口都是节点本机的**，farm 直接连不上（实机可能在 NAT 后面）。farm 侧
 * 拿到之后要对每个用得上的端口开一条流（`openStream`），把它变成 farm 本机的一个
 * 回环端点，再把这个回环端点喂给既有的 WebDriver / CDP 数据面——观测层只认
 * 「一个 CDP 端点」，认不出它背后是容器还是一台北京的台式机，这正是
 * SlotProvider 抽象的全部意义（plan §12）。
 *
 * `wdPort` 在 `mode: "cdp"` 下是 null：那条路上根本没有 chromedriver。
 * `cdpPort` 是 browser-level CDP 的 HTTP 端口（`/json/version` 在这上面），
 * `cdpDebugPort` 是浏览器 `--remote-debugging-port` 的值——两者在 Docker 后端
 * 常常相等，但在实机上一台机器要跑多个槽位，必须各自分配，绝不能合并成一个字段。
 */
export const acquireResultSchema = z.object({
	browserArgs: z.array(z.string()),
	cdpDebugPort: portSchema,
	cdpPort: portSchema,
	containerId: z.string().min(1),
	wdPort: portSchema.nullable(),
});
export type AcquireResult = z.infer<typeof acquireResultSchema>;

/** 按槽位 id 操作的三个方法共用的入参。 */
export const containerRefParamsSchema = z.object({
	containerId: z.string().min(1),
});
export type ContainerRefParams = z.infer<typeof containerRefParamsSchema>;

/** `listManaged` 没有入参。写成空对象而不是 `z.void()`：将来加过滤条件时不必改帧型。 */
export const listManagedParamsSchema = z.object({});

/**
 * `detectCapabilities` 也没有入参：**探哪种后端不由 farm 说了算**。
 *
 * 节点被登记成哪种后端是 helloAck 那一刻定下的，agent 自己记得；让 farm 再传一次
 * 就等于允许两边说法不一致，而那种不一致的症状是「平台上显示的浏览器清单，
 * 与这台机器真正会用的那套完全无关」。空对象而不是 `z.void()`，理由同上。
 */
export const detectCapabilitiesParamsSchema = z.object({});

/**
 * agent 认为自己名下还活着的槽位。两个可空字段是真的可空——agent 重启后靠扫
 * 槽位目录重建这张表，目录里的 meta 可能缺、可能坏。farm 侧对缺失的处理必须是
 * 「照收（当孤儿杀）」而不是「跳过」，与 Docker 后端 reaper 的口径完全一致
 * （`@automationstack/browser-slots` 的 `types.ts` 里 `ManagedContainer` 那段注释）。
 */
export const managedSlotSchema = z.object({
	containerId: z.string().min(1),
	expiresAtEpochSec: z.int().positive().nullable(),
	sessionId: z.string().min(1).nullable(),
});
export const listManagedResultSchema = z.array(managedSlotSchema);
export type ManagedSlot = z.infer<typeof managedSlotSchema>;

/** 槽位的浏览器 / driver 日志，收尾时一次性拉走存成 `container_log` 产物。 */
export const readLogsResultSchema = z.object({ logs: z.string() });
export type ReadLogsResult = z.infer<typeof readLogsResultSchema>;

/**
 * 没有返回值的方法回什么。
 *
 * 回 `null` 而不是省略 `value` 字段：`result` 信封的 `ok: true` 分支恒定带
 * `value`，两侧就不用为「这个方法有没有返回值」分两条解析路径。
 */
export const emptyResultSchema = z.null();

/**
 * 方法 → (入参 schema, 出参 schema) 的对照表。
 *
 * 有了它，agent 侧的分发可以是一个 `for` 而不是五个 `if`：先按 method 取出
 * `params` 校验，再把处理函数的返回值按 `result` 校验回一次——**两侧都校验**，
 * 因为对端是另一台机器上的另一个版本，「我这边类型对」在这条链路上不构成证据。
 */
export const farmRpcContracts = {
	acquire: { params: acquireParamsSchema, result: acquireResultSchema },
	detectCapabilities: {
		params: detectCapabilitiesParamsSchema,
		result: nodeCapabilitiesSchema,
	},
	listManaged: {
		params: listManagedParamsSchema,
		result: listManagedResultSchema,
	},
	readLogs: {
		params: containerRefParamsSchema,
		result: readLogsResultSchema,
	},
	release: { params: containerRefParamsSchema, result: emptyResultSchema },
	releaseContainer: {
		params: containerRefParamsSchema,
		result: emptyResultSchema,
	},
} as const satisfies Record<
	FarmRpcMethod,
	{ params: z.ZodType; result: z.ZodType }
>;
