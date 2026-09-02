import {
	FARM_SESSION_ACTIVE_STATUSES,
	FARM_SESSION_TERMINAL_STATUSES,
} from "@automationstack/db/repositories/farm-session-status-core";
import { z } from "zod";

/**
 * 浏览器农场控制面（phase4 §7）的输入契约。
 *
 * ## 为什么这里从 db 包**派生**枚举，而 `./test-run.ts` 是手抄一遍
 *
 * 那边抄，是因为唯一的取值来源是 drizzle 的 pgEnum 实例，import 它等于把 drizzle
 * 拖进 api 包。farm 这边不一样：`repositories/farm-session-status-core.ts` 是一个
 * **纯常量模块**（只 `import type` 那个字面量类型，运行时零依赖），它存在的理由本身
 * 就是「让状态判据只有一份」。既然有这么一份可以安全 import 的定义，再抄一遍就是
 * 白白多一个漂移点——加了新状态而这里忘了跟，表现是筛选器少一个选项、而且不报错。
 *
 * 两个常量并起来恰好是全部取值：db 侧的单测钉死了「活跃集 + 终态集 = 整个枚举」，
 * 所以这个并集不会漏。顺序（活跃在前、终态在后）也正是生命周期顺序，前端拿它渲染
 * 筛选下拉时不用再排一次。
 */

/** 会话列表一页默认给多少行。列表页首屏就是这个数，不做无限滚动。 */
const DEFAULT_SESSION_PAGE_SIZE = 50;

/**
 * 单页上限。挡的不是恶意，是「前端顺手传个 10000 想一次拉完」——
 * 会话行带 join，一次几千行既拖库也拖 SSR 的序列化。
 */
const MAX_SESSION_PAGE_SIZE = 100;

/** 浏览器族名（`chromium`）与版本号（`140`）都是短串。 */
const MAX_BROWSER_FIELD_LENGTH = 64;

/** 完整镜像引用（`registry/ns/automationstack-browser-chromium:140`）留宽一些。 */
const MAX_BROWSER_IMAGE_LENGTH = 512;

export const farmSessionStatusSchema = z.enum([
	...FARM_SESSION_ACTIVE_STATUSES,
	...FARM_SESSION_TERMINAL_STATUSES,
]);

/**
 * 会话的两个定位键**必须同时传**：`sessionId` 是 uuid，但 handler 仍然要拿
 * `projectId` 去比对会话归属（见 `routers/farm-sessions.ts`）。少了它，授权中间件
 * 就没有可判的项目，整条路由等于对全平台会话开放。
 */
export const farmSessionScopeSchema = z.object({
	projectId: z.uuid(),
	sessionId: z.uuid(),
});

export const listFarmSessionsSchema = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(MAX_SESSION_PAGE_SIZE)
		.default(DEFAULT_SESSION_PAGE_SIZE),
	offset: z.number().int().min(0).default(0),
	projectId: z.uuid(),
	/** 状态多选（any-of）。不传 / 空数组 = 不筛，语义由仓储层保证。 */
	statuses: z.array(farmSessionStatusSchema).optional(),
});

const browserFieldSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_BROWSER_FIELD_LENGTH);
const browserImageSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_BROWSER_IMAGE_LENGTH);

export const farmBrowserIdSchema = z.object({ id: z.uuid() });

export const createFarmBrowserSchema = z.object({
	browser: browserFieldSchema,
	enabled: z.boolean().optional(),
	image: browserImageSchema,
	isDefault: z.boolean().optional(),
	version: browserFieldSchema,
});

/**
 * 改目录行。**`browser` / `version` 不在 patch 里**，与仓储层的
 * `UpdateFarmBrowserInput` 一字不差：它们是调度的寻址键，改掉等于让
 * 「客户端请求 chromium/140」悄悄指向另一个镜像，而历史会话里快照的还是旧值。
 *
 * patch 包一层对象而不是把三个字段平铺到顶层，是为了让「没传」和「传了 undefined」
 * 在传输层不再需要区分：前端只把真正改动的键放进 patch，仓储层照着有没有键决定
 * 写不写。平铺的话 `id` 和业务字段混在一起，将来加一个同名字段就会打架。
 */
export const updateFarmBrowserSchema = z.object({
	id: z.uuid(),
	patch: z.object({
		enabled: z.boolean().optional(),
		image: browserImageSchema.optional(),
		isDefault: z.boolean().optional(),
	}),
});

/**
 * 节点名是人给自己认的标签（「工位 A 的 Mac mini」），不参与任何寻址，
 * 与浏览器目录的字段上限取同一档 64，免得两张表单的「最多几个字」各说各话。
 */
const MAX_NODE_NAME_LENGTH = 64;

/**
 * 单节点的槽位上限。挡的不是恶意，是「顺手填个 999 想榨干这台机器」——
 * 一个槽位等于一个真实浏览器进程，本机 Chrome 后端下几十个就足以让那台机器
 * 失去响应，而节点是别人工位上的机器，卡死了没人能远程救。
 */
const MAX_NODE_SLOTS = 64;

/**
 * 不填时给 2。取 2 而不是 1：装完就只能跑一条会很像「没生效」；
 * 也不取更大值——默认值应当在任何一台开发机上都是安全的。
 */
const DEFAULT_NODE_SLOTS = 2;

/**
 * 节点后端。`local` = 直接在那台机器上起本机 Chrome，`docker` = 在那台机器的
 * Docker 里起容器。两者的取值来源是 node-agent 的启动方式，不是数据库枚举，
 * 所以这里手写而不是从 db 派生（与 `farmSessionStatusSchema` 那条不同：
 * 那边有一个可以安全 import 的纯常量模块，这边没有）。
 */
export const farmNodeBackendSchema = z.enum(["local", "docker"]);

/**
 * 按 id 点一行。`remove` / `rotateToken` / `requestRefresh` 共用这一个：三条的
 * 输入逐字相同，各写一份的唯一后果是将来某一条悄悄多长出一个字段而另外两条没跟。
 *
 * 它们的**返回语义**倒是各不相同（静默 `{ ok }` / NOT_FOUND / 「已记下」而非
 * 「已完成」），那些差别逐条写在 routers/farm-nodes.ts 上——那是过程的契约，
 * 不属于输入 schema，塞进这里只会让下一个人以为改这里就能改掉那些行为。
 */
export const farmNodeIdSchema = z.object({ id: z.uuid() });

/**
 * 保留名。farm 的调度里有一个**内建伪节点**代表「跑在 farm 本机」，它的名字恒为
 * `local`（真相源：`apps/farm/src/nodes/source-registry.ts` 的
 * `BUILTIN_SOURCE_NAME`）。用例里写 `as:options.node: "local"` 就是点名要它。
 *
 * 所以实机节点不能也叫这个名字：farm 的来源表是一张按名字索引的 Map，重名之后
 * 「点名 local 到底去哪」变成一个要看谁先连上来的问题——而这种二义不会报错，
 * 只会让会话安静地跑在错误的机器上。
 *
 * 这里手写一份而不是 import：`apps/farm` 是应用、`packages/api` 是包，包不该反向
 * 依赖应用。代价是多一个漂移点，缓解是两边的注释互相点名，且这条有单测钉着。
 */
export const RESERVED_NODE_NAME = "local";

/**
 * 撞上保留名时说的那句话。**导出**是给 web 表单用的：oRPC 把输入校验失败统一
 * 包成一句「Input validation failed」，zod 的 message 到不了表单那一行红字，
 * 所以前端要在提交前自己拦一次。两边共用这一个常量，才不会出现「服务端拒的
 * 理由」和「表单上写的理由」各说各话。
 */
export const RESERVED_NODE_NAME_MESSAGE = `「${RESERVED_NODE_NAME}」是内建槽位来源的保留名，不能给实机节点用，否则用例里点名这个名字会分不清指哪一台。换一个能认出是哪台机器的名字，比如「工位A-mac-mini」。`;

/*
 * 大小写不敏感地拒。farm 那张 Map 是精确匹配，严格说只有小写的 `local` 会真的
 * 撞上；但「Local」在人眼里和它是同一个名字，放过去等于给运维埋一个「我明明有
 * 一台叫 Local 的机器，点名 local 怎么去了别处」的坑——而这个坑要靠读调度源码
 * 才能爬出来。宁可在登记时多拒一个没人真想用的名字。
 */
const nodeNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_NODE_NAME_LENGTH)
	.refine((value) => value.toLowerCase() !== RESERVED_NODE_NAME, {
		message: RESERVED_NODE_NAME_MESSAGE,
	});
const nodeSlotsSchema = z.number().int().min(1).max(MAX_NODE_SLOTS);

export const createFarmNodeSchema = z.object({
	backend: farmNodeBackendSchema,
	maxSlots: nodeSlotsSchema.default(DEFAULT_NODE_SLOTS),
	name: nodeNameSchema,
});

/**
 * 改节点。三项**平铺在顶层**，没有像 `updateFarmBrowserSchema` 那样包一层
 * `patch`——不是随手写的：那边包起来是因为 `browser` / `version` 这两个**不可改
 * 的寻址键**也在同一个对象里，平铺会让「能改的」和「不能改的」混成一片；
 * 节点这边可改的就是全部字段，`id` 之外再没有别的东西会跟它们打架。
 *
 * 代价是「没传」与「传了 undefined」在传输层不再自动区分，所以路由 handler 里
 * 必须按键是否 `!== undefined` 自己拼 patch（见 routers/farm-nodes.ts），
 * 不能把整个输入减去 id 直接甩给仓储。
 */
export const updateFarmNodeSchema = z.object({
	enabled: z.boolean().optional(),
	id: z.uuid(),
	maxSlots: nodeSlotsSchema.optional(),
	name: nodeNameSchema.optional(),
});
