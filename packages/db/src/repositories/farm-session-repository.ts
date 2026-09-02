import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "../index";
import type {
	FarmSessionProtocol,
	FarmSessionStatus,
} from "../schema/farm-enums";
import { farmNodes } from "../schema/farm-nodes";
import {
	type FarmSession,
	farmSessions,
	type NewFarmSession,
} from "../schema/farm-sessions";
import { users } from "../schema/users";
import { FARM_SESSION_TERMINAL_STATUSES } from "./farm-session-status-core";
import type { RepositoryNotFound } from "./repository-types";

/**
 * 会话行的读写（phase4 §4）。两个进程共用这一个文件：
 * `apps/farm` 走写路径（建行、推状态、启动对账、轮询待杀），
 * `packages/api` 走读路径与控制面的 kill 意向。两边都不许自己碰 drizzle（本仓铁律）。
 *
 * ⚠️ 这张表是审计视图，**不是 farm 的真相**（D6）。真相在 farm 进程的内存注册表里；
 * 库里的 `running` 只意味着「最后一次写入时它在跑」，farm 被 kill -9 之后那些行会
 * 一直挂到下次启动对账。任何「先读库再决定要不要转发」的写法都是错的。
 */

/**
 * 列表页要的字段。**刻意不回 `requestedCapabilities`**：那是一坨完整的 WebDriver
 * caps，一页 20 行就是 20 坨 jsonb 搬进 Node 堆，而列表上一个字都不显示它。
 * 详情页走 `findSessionById` 拿全行。
 *
 * 与 `ProjectMemberView` / `ApiTokenView` 同档，独立声明而不是 `Omit<FarmSession, ...>`：
 * 后者在给表加新列时会静默地把它带出去，独立接口则在多一列少一列时编译期就报错。
 */
export interface FarmSessionListItem {
	browser: string;
	createdAt: Date;
	finishedAt: Date | null;
	id: string;
	killRequestedAt: Date | null;
	label: string | null;
	/**
	 * 跑在哪台实机节点上（plan §12）。null 有**两种**含义，列表页都显示成
	 * 「内建」以外的东西都不对：会话本来就跑在 farm 内建 provider 上
	 * （`nodeId` 为 null），或者那台节点已被注销（`set null` 之后 join 不到）。
	 * 两者事后已经区分不了——真要区分就得在会话上快照节点名，而节点会改名，
	 * 那又会引出「快照的名和现在的名对不上」的第二种困惑。
	 */
	nodeName: string | null;
	protocol: FarmSessionProtocol;
	startedAt: Date | null;
	status: FarmSessionStatus;
	statusReason: string | null;
	/** 发起人用户名。null = 账号已删（`userId` 是 `set null`），不是「没有发起人」。 */
	username: string | null;
	version: string;
}

export interface ListFarmSessionsFilter {
	limit: number;
	offset: number;
	projectId: string;
	/** 状态多选，any-of；空数组或不传视同不筛选。 */
	statuses?: FarmSessionStatus[];
}

export interface ListFarmSessionsResult {
	items: FarmSessionListItem[];
	total: number;
}

export interface UpdateFarmSessionStatusInput {
	containerId?: string;
	finishedAt?: Date;
	/**
	 * 这条会话最终跑在哪台实机节点上；**null = 跑在 farm 内建的 provider 上**
	 * （语义见 `schema/farm-sessions.ts` 的 `nodeId` 列）。
	 *
	 * 为什么是在这里回填而不是在 `createSession` 时就写死：选哪个槽位来源是
	 * `acquire` 那一刻才定的（点名的节点可能刚好掉线、自动调度要看实时占用），
	 * 而库行必须在 acquire **之前**就建好——会话 id 得先存在，容器的 label 才能
	 * 写上它。于是这条列跟着「起来了」那一次状态推进一起落，省掉一次额外往返。
	 *
	 * `undefined` = 这次不动它（与本入参其它可选项同款），显式 `null` = 写回内建源。
	 */
	nodeId?: string | null;
	startedAt?: Date;
	status: FarmSessionStatus;
	statusReason?: string;
}

/**
 * `settled` = 这一行**已经是终态**，本次写入被守卫挡下并原样回带库里那一行。
 *
 * 它不是错误：收尾与 reaper 并发时必然出现，调用方通常只需记一条 debug 日志。
 * 但它与 `updated` 必须能分开——分不开的话，reaper 会以为自己成功把会话杀掉了，
 * 从而在日志与指标里报出一个根本没发生的强杀。
 */
export type UpdateFarmSessionStatusResult =
	| { kind: "settled"; session: FarmSession }
	| { kind: "updated"; session: FarmSession }
	| RepositoryNotFound;

/**
 * 建会话行。入参就是整行（`NewFarmSession`），因此 `nodeId` 这类新列**不需要
 * 在这里开一个专门的入口**——加了列就自动能落，也就没有「加了列却忘了让
 * createSession 带上」这种漏法。可空的 `nodeId` 语义见 `schema/farm-sessions.ts`：
 * null = 跑在 farm 内建的容器 provider 上。
 *
 * `id` 由调用方（farm）生成并传入，**这里不会替它编一个**
 * ——理由写在 `schema/farm-sessions.ts` 的 `id` 列上：那个 id 要先进内存注册表、
 * 再回填进 create-session 响应，等不了一次库写入。
 */
export async function createSession(row: NewFarmSession): Promise<FarmSession> {
	const [created] = await db.insert(farmSessions).values(row).returning();
	if (!created) {
		throw new Error(`创建 farm 会话失败：插入没有返回行 session=${row.id}`);
	}
	return created;
}

export async function findSessionById(id: string): Promise<FarmSession | null> {
	const [row] = await db
		.select()
		.from(farmSessions)
		.where(eq(farmSessions.id, id))
		.limit(1);
	return row ?? null;
}

/**
 * 推进会话状态。**终态封口**：当前已是终态时这次写入不生效，返回 `settled`。
 *
 * ## 为什么守卫写在 SQL 的 WHERE 里，而不是「先读一行判一下再写」
 *
 * 这条会话有两个并发的收尾触发源（§5.2）：正常路径（客户端 DELETE / WS 关闭）与
 * reaper（过期扫描、启动对账）。「先读再写」中间那个窗口正是它们会撞上的地方——
 * 正常路径刚把它写成 `completed`，reaper 手里那份读出来的 `running` 已经过期，
 * 紧接着把同一行改成 `killed`。事后看这条会话，死因就是假的，而没有任何地方会报错。
 * 判定必须发生在数据库那一份数据上，`notInArray(status, 终态)` 就是这个判定。
 *
 * 判据本身在 `farm-session-status-core.ts`（可测的那一份），这里是它生效的地方；
 * 两处一旦分叉，单测会全绿而线上照样双写。
 *
 * 同一终态的重复写入同样走 `settled`：`finishedAt` 与 `statusReason` 因此永远保留
 * **第一次**落定时的值，不会被后来的重试冲掉（与 `revokeApiToken` 同一条规矩）。
 */
export async function updateSessionStatus(
	id: string,
	input: UpdateFarmSessionStatusInput
): Promise<UpdateFarmSessionStatusResult> {
	const set: Partial<NewFarmSession> = { status: input.status };
	if (input.statusReason !== undefined) {
		set.statusReason = input.statusReason;
	}
	if (input.startedAt !== undefined) {
		set.startedAt = input.startedAt;
	}
	if (input.finishedAt !== undefined) {
		set.finishedAt = input.finishedAt;
	}
	if (input.containerId !== undefined) {
		set.containerId = input.containerId;
	}
	if (input.nodeId !== undefined) {
		set.nodeId = input.nodeId;
	}
	const [updated] = await db
		.update(farmSessions)
		.set(set)
		.where(
			and(
				eq(farmSessions.id, id),
				notInArray(farmSessions.status, [...FARM_SESSION_TERMINAL_STATUSES])
			)
		)
		.returning();
	if (updated) {
		return { kind: "updated", session: updated };
	}
	// 没匹配上只有两种可能：行不存在，或者它已经落定了。多查一次把两者分开——
	// 调用方对这两件事的反应完全不同（前者是 bug，后者是预期内的并发收尾）。
	const existing = await findSessionById(id);
	return existing
		? { kind: "settled", session: existing }
		: { kind: "not-found" };
}

/**
 * 项目内的会话列表，创建时间倒序 + 分页。
 *
 * `leftJoin` 而不是 `innerJoin`：`userId` 是 `set null`，账号删了之后那条会话仍然
 * 是一份有效的排查材料，innerJoin 会让它从列表里整行消失。
 */
export async function listSessionsByProject(
	filter: ListFarmSessionsFilter
): Promise<ListFarmSessionsResult> {
	const conditions = [eq(farmSessions.projectId, filter.projectId)];
	if (filter.statuses && filter.statuses.length > 0) {
		conditions.push(inArray(farmSessions.status, filter.statuses));
	}
	const where = and(...conditions);
	const [countRow] = await db
		.select({ value: count() })
		.from(farmSessions)
		.where(where);
	const items = await db
		.select({
			browser: farmSessions.browser,
			createdAt: farmSessions.createdAt,
			finishedAt: farmSessions.finishedAt,
			id: farmSessions.id,
			killRequestedAt: farmSessions.killRequestedAt,
			label: farmSessions.label,
			nodeName: farmNodes.name,
			protocol: farmSessions.protocol,
			startedAt: farmSessions.startedAt,
			status: farmSessions.status,
			statusReason: farmSessions.statusReason,
			username: users.username,
			version: farmSessions.version,
		})
		.from(farmSessions)
		.leftJoin(users, eq(users.id, farmSessions.userId))
		.leftJoin(farmNodes, eq(farmNodes.id, farmSessions.nodeId))
		.where(where)
		.orderBy(desc(farmSessions.createdAt))
		.limit(filter.limit)
		.offset(filter.offset);
	return { items, total: countRow?.value ?? 0 };
}

/**
 * 收敛侧的四个过程搬到了 `./farm-session-reaper-repository`（原文件越过了仓库
 * 300 行的上限，scripts/check-file-rules.js）。这里原样 re-export，是为了让
 * 「farm 会话的仓储在哪个文件」这个问题仍然只有一个答案——现有调用方
 * （apps/farm 的 reaper、packages/api 的控制面）的 import 路径一律不用动。
 */
// biome-ignore lint/performance/noBarrelFile: 这不是「顺手 re-export 一切」的中转文件，而是拆文件时为保住既有 import 路径留的四个具名转发；改调用方的 import 是纯噪音改动，且会散落到两个 app 里
export {
	countActiveSessions,
	listKillRequestedSessionIds,
	markOrphanedRunningSessions,
	requestKill,
} from "./farm-session-reaper-repository";
