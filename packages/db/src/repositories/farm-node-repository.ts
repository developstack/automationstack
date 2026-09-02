import { eq, sql } from "drizzle-orm";

import { generateFarmNodeToken, hashFarmNodeToken } from "../farm-node-token";
import { db } from "../index";
import type { FarmNodeBackend } from "../schema/farm-enums";
import { type FarmNodeView, farmNodes } from "../schema/farm-nodes";

/**
 * 实机节点的读写（phase4 §12）。表本身的理由见 `schema/farm-nodes.ts`。
 *
 * 两类调用方，口径不同：
 * - **管理 UI**（`packages/api` 的 adminProcedure）注册 / 改名 / 调槽位 / 轮换凭据；
 * - **farm**（`apps/farm`）走 `findNodeByToken`（agent hello 的鉴权）与
 *   `touchNodeLastSeen`（心跳落库）。
 *
 * ## 除了创建与轮换，任何函数都不碰 `token_hash`
 *
 * 读路径一律**显式选列**、返回 `FarmNodeView`，而不是 `select()` 全列。理由与
 * `api-tokens-repository.listApiTokensByUser` 逐字相同：哈希没有任何理由离开
 * Postgres，少查一列，下游每一处（日志、错误上报、序列化、tRPC 出参）就都不必
 * 记得别把它带出去。返回类型标成 `FarmNodeView`，选列漏一个或多一个都在编译期报错。
 */

/** 读路径统一的选列表。写在一处，免得四个函数各选各的然后慢慢分叉。 */
const NODE_VIEW_COLUMNS = {
	backend: farmNodes.backend,
	/*
	 * 能力三列跟着读路径一起出：管理页要在同一张表里画「这台机器有什么」，
	 * 单独再开一条按 id 取能力的过程，等于让列表页为 N 行发 N 次请求。
	 * 它们是**展示用的副本**，任何调用方都不许拿来派活（见 schema 顶部）。
	 */
	capabilities: farmNodes.capabilities,
	capabilitiesUpdatedAt: farmNodes.capabilitiesUpdatedAt,
	createdAt: farmNodes.createdAt,
	enabled: farmNodes.enabled,
	id: farmNodes.id,
	lastSeenAt: farmNodes.lastSeenAt,
	maxSlots: farmNodes.maxSlots,
	name: farmNodes.name,
	refreshRequestedAt: farmNodes.refreshRequestedAt,
};

export interface CreateFarmNodeInput {
	backend: FarmNodeBackend;
	/** 不传就用 `FARM_NODE_DEFAULT_MAX_SLOTS`（列默认值，见 schema）。 */
	maxSlots?: number;
	name: string;
}

/**
 * 创建的返回值是**唯一一次**明文出现的地方，之后任何接口都取不到
 * （与 `CreatedApiToken` 同款）。调用方必须把它一次性交给用户，
 * 别顺手记进日志——那等于把凭据写进了一个永远不会轮换的地方。
 */
export interface CreatedFarmNode {
	node: FarmNodeView;
	token: string;
}

/**
 * 可改的三项。**`backend` 不可改**：它决定复位纪律（销毁容器 vs 杀进程树 +
 * 删 profile + 健康探测），改掉等于让已经登记好的那台机器换一套收尾流程，
 * 而库里没有任何东西会提示这件事发生过。换后端就重新注册一台。
 */
export interface UpdateFarmNodeInput {
	enabled?: boolean;
	maxSlots?: number;
	name?: string;
}

function findNodeViewById(id: string): Promise<FarmNodeView | null> {
	return db
		.select(NODE_VIEW_COLUMNS)
		.from(farmNodes)
		.where(eq(farmNodes.id, id))
		.limit(1)
		.then(([row]) => row ?? null);
}

/**
 * 注册一台节点，返回节点行与**只此一次**的明文凭据。
 *
 * `id` 由这里生成而不是交给数据库默认值，与 `farm_sessions` 同风格（理由见
 * schema 的 `id` 列）。重名会撞 `farm_nodes_name_uq` 直接抛——刻意不吞成
 * 「返回 null」：注册是一次显式的管理操作，重名是操作者要立刻看见的错误，
 * 而不是一个需要他自己去猜的空结果。
 */
export async function createNode(
	input: CreateFarmNodeInput
): Promise<CreatedFarmNode> {
	const generated = await generateFarmNodeToken();
	const [row] = await db
		.insert(farmNodes)
		.values({
			backend: input.backend,
			id: crypto.randomUUID(),
			maxSlots: input.maxSlots,
			name: input.name,
			tokenHash: generated.tokenHash,
		})
		.returning(NODE_VIEW_COLUMNS);
	if (!row) {
		throw new Error("注册实机节点失败：插入没有返回行");
	}
	return { node: row, token: generated.plaintext };
}

/**
 * 全部节点，**含停用的**——管理页要显示它们。调度侧别直接拿这个结果去派活，
 * 自己判 `enabled`（与 `listBrowsers` 同一条分工）。
 *
 * 按 `name` 升序而不是创建时间：这张表是运维找机器用的，一台机器叫什么比它
 * 什么时候注册的更容易记住。
 */
export function listNodes(): Promise<FarmNodeView[]> {
	return db.select(NODE_VIEW_COLUMNS).from(farmNodes).orderBy(farmNodes.name);
}

/**
 * agent hello 的鉴权入口：按明文算哈希再等值查找。
 *
 * **刻意不过滤 `enabled`**：调用方需要能区分「凭据不对」与「这台机器被停用了」，
 * 两者给 agent 的响应完全不同（后者该让 agent 安静地退避重试，而不是当成配置
 * 错误刷告警）。过滤掉之后两种情况在调用方看来都是 null，那条信息就再也拿不
 * 回来了——与 `findBrowserByNameVersion` 同一条取舍。
 *
 * 明文不做任何裁剪或前缀校验：哈希的就是完整串（见 `farm-node-token.ts`），
 * 前缀不对的输入自然查不中，多一道校验只是多一处可以写错的地方。
 */
export async function findNodeByToken(
	token: string
): Promise<FarmNodeView | null> {
	const tokenHash = await hashFarmNodeToken(token);
	const [row] = await db
		.select(NODE_VIEW_COLUMNS)
		.from(farmNodes)
		.where(eq(farmNodes.tokenHash, tokenHash))
		.limit(1);
	return row ?? null;
}

/**
 * 改节点。返回 null = 行不存在（与 `updateBrowser` 同一条存在性语义）。
 *
 * 空 patch 走一次纯读并回带当前行，同样照抄 `updateBrowser`：让调用方不必
 * 为「什么都没改」单独分一个支，也免得发一条 `SET` 为空的 UPDATE。
 */
export async function updateNode(
	id: string,
	patch: UpdateFarmNodeInput
): Promise<FarmNodeView | null> {
	const set: UpdateFarmNodeInput = {};
	if (patch.name !== undefined) {
		set.name = patch.name;
	}
	if (patch.maxSlots !== undefined) {
		set.maxSlots = patch.maxSlots;
	}
	if (patch.enabled !== undefined) {
		set.enabled = patch.enabled;
	}
	if (Object.keys(set).length === 0) {
		return await findNodeViewById(id);
	}
	const [row] = await db
		.update(farmNodes)
		.set(set)
		.where(eq(farmNodes.id, id))
		.returning(NODE_VIEW_COLUMNS);
	return row ?? null;
}

/**
 * 注销一台节点。**不影响它跑过的历史会话**：`farm_sessions.nodeId` 是
 * `set null`，那些行连同录制产物都留着，只是从此看起来像内建 provider 跑的
 * （列表页 join 出来的 `nodeName` 会变 null）。
 *
 * 日常该用的是 `enabled: false`——停用留得下「我们曾经有这台机器」这个事实，
 * 删除留不下。这个函数是给「一开始就录错了」准备的（与 `removeBrowser` 同款）。
 */
export async function removeNode(id: string): Promise<boolean> {
	const rows = await db
		.delete(farmNodes)
		.where(eq(farmNodes.id, id))
		.returning({ id: farmNodes.id });
	return rows.length > 0;
}

/**
 * 轮换凭据：换一份新的，**旧串当场失效**（覆盖 `token_hash`，不留历史行）。
 * 返回 null = 行不存在。
 *
 * 没有「宽限期内新旧都认」这种设计，是故意的：那需要第二列哈希加一个过期时刻，
 * 而轮换的场景本就是「这份凭据可能泄露了」——多留一分钟就是多一分钟的洞。
 * 代价是节点会因为凭据失效掉线，得去机器上更新配置；它本来就要去更新配置。
 */
export async function rotateNodeToken(
	id: string
): Promise<{ token: string } | null> {
	const generated = await generateFarmNodeToken();
	const [row] = await db
		.update(farmNodes)
		.set({ tokenHash: generated.tokenHash })
		.where(eq(farmNodes.id, id))
		.returning({ id: farmNodes.id });
	return row ? { token: generated.plaintext } : null;
}

/**
 * 记一次心跳。行不存在就是**空操作**，所以这个函数对调用方永远成功。
 *
 * 心跳按 agent 固定的节拍一次一拍，只写一列，且写丢一次不影响任何鉴权判断
 * ——它唯一的消费者是管理页的 online 判定，而那条判据是算出来的、不落库
 * （窗口与「容三拍」的理由在 `packages/api/src/lib/farm-node-online.ts`）。
 * 因此它**绝不该阻塞 agent 的连接维持**：调用方接住异常记日志即可。
 *
 * 与 `touchApiTokenLastUsed` 的差别：那边带节流谓词（鉴权是最热的路径，每次
 * 请求都写一行太亏），这里不带。心跳本身就是按拍来的低频写，再加一层节流
 * 只会让 `lastSeenAt` 比实际心跳更旧，直接把 online 判定的窗口啃掉一截。
 *
 * 时钟取 `now()` 而不是 Node 的 `new Date()`：与 `createdAt` 的 `defaultNow`
 * 同一个来源，免得多实例的机器时间偏差让「最后心跳在未来」这种行出现在库里。
 */
export async function touchNodeLastSeen(id: string): Promise<void> {
	await db
		.update(farmNodes)
		.set({ lastSeenAt: sql`now()` })
		.where(eq(farmNodes.id, id));
}

/**
 * 能力清单与「重新探测」标记的三个过程搬到了
 * `./farm-node-capability-repository`（原文件加上它们会越过仓库 300 行的上限，
 * scripts/check-file-rules.js）。这里原样 re-export，是为了让「节点的仓储在哪个
 * 文件」这个问题仍然只有一个答案——调用方（packages/api 的控制面、apps/farm 的
 * 轮询拍）的 import 路径一律不用动。与 `farm-session-repository` 那一处同款。
 */
// biome-ignore lint/performance/noBarrelFile: 这不是「顺手 re-export 一切」的中转文件，而是拆文件时为保住既有 import 路径留的三个具名转发；改调用方的 import 是纯噪音改动，且会散落到 api 与 farm 两处
export {
	listRefreshRequestedNodeIds,
	requestNodeRefresh,
	saveNodeCapabilities,
} from "./farm-node-capability-repository";
