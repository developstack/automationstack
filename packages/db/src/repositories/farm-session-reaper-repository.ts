/**
 * 会话的**收敛侧**读写：强杀链路（下令 → reaper 取队列 → 执行）、启动对账，
 * 以及给人看的活跃数。与 `farm-session-repository.ts` 同一张表，拆开只因为
 * 原文件越过了仓库 300 行的上限（scripts/check-file-rules.js）。
 *
 * 切在这里而不是别处：上面那半是**单条会话的 CRUD**（建行、按 id 取、推状态、
 * 列表），调用它的是请求路径；这半是**整个农场的收敛动作**，调用它的是 reaper
 * 的定时拍与控制面的按钮。`requestKill` 归到这一半，是因为它是同一条强杀链路的
 * 前半段——「下令」与「取队列」分居两个文件时，改其中一个而忘了另一个的代价，
 * 正是「点了强杀但永远不生效」这种查起来最费劲的故障。
 *
 * 为了不惊动任何调用方，`farm-session-repository.ts` 把这四个符号原样 re-export
 * 出去：现有 import 路径一个字都不用改。
 */

import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "../index";
import { farmSessions } from "../schema/farm-sessions";
import { FARM_SESSION_ACTIVE_STATUSES } from "./farm-session-status-core";

/**
 * reaper 每一拍要杀的会话 id（控制面下过 kill 意向、且还活着的那些）。
 *
 * 不含 `finishing`：那些已经在收尾了，再杀一遍只会把死因从 `completed` 改写成
 * `killed`（虽然 `updateSessionStatus` 的终态守卫拦得住最终结果，但白跑一趟
 * 容器销毁流程仍然会打断正在进行的截图与日志拉取）。
 *
 * 按下令时刻升序：先下令的先杀，这样一次批量强杀的延迟分布是可预期的。
 */
export async function listKillRequestedSessionIds(): Promise<string[]> {
	const rows = await db
		.select({ id: farmSessions.id })
		.from(farmSessions)
		.where(
			and(
				inArray(farmSessions.status, ["starting", "running"]),
				isNotNull(farmSessions.killRequestedAt)
			)
		)
		.orderBy(asc(farmSessions.killRequestedAt));
	return rows.map((row) => row.id);
}

/**
 * 控制面强杀：置**意向标记**，真正的销毁由 farm 的 reaper 下一拍执行（§7）。
 * 返回是否命中一条可杀的会话。
 *
 * `projectId` 这个条件是**越权杀别人项目会话的唯一防线**，不能指望上层先查一次归属
 * 再调这里——那中间就有一个窗口，而且每多一个调用方就多一次漏查的机会。归属不符与
 * 「会话不存在」一并返回 false，不区分：区分了就等于告诉调用者「这个 id 存在，
 * 只是不归你」，那本身就是一次信息泄露。
 *
 * 重复下令**返回 true 但不改时刻**（`coalesce` 保留第一次）：对控制面来说「杀」是
 * 幂等意图，第二次点不该报错；而 `killRequestedAt` 保留第一次，「从下令到真的杀掉
 * 花了多久」才是可查的——用 `now()` 直接覆盖的话，每点一次就把这个时长清零一次。
 */
export async function requestKill(
	projectId: string,
	sessionId: string
): Promise<boolean> {
	const rows = await db
		.update(farmSessions)
		.set({
			killRequestedAt: sql`coalesce(${farmSessions.killRequestedAt}, now())`,
		})
		.where(
			and(
				eq(farmSessions.id, sessionId),
				eq(farmSessions.projectId, projectId),
				inArray(farmSessions.status, [...FARM_SESSION_ACTIVE_STATUSES])
			)
		)
		.returning({ id: farmSessions.id });
	return rows.length > 0;
}

/**
 * farm 启动对账（D6）：把上一条命留下的活跃行全部判死，返回被收敛的 id。
 *
 * farm 单副本、路由表在内存，进程一没了那些容器就再也没人认领——库里的 `running`
 * 从那一刻起就是假话。启动时不收敛的话，它们会永远挂在会话列表里，
 * 而配额如果哪天改成按库里的活跃数算（`countActiveSessions`），平台会直接锁死。
 *
 * 落 `failed` 而不是 `killed`：`killed` 的含义是「有人要求杀」，这里没有人要求，
 * 是平台自己没保住。区别写在 `statusReason`（约定 `orphaned`），由调用方传入。
 *
 * ⚠️ **必须在 farm 开始接受新会话之前调**：它按状态无差别扫全表，晚一步就会把
 * 刚刚建出来的新会话一起判死。
 */
export async function markOrphanedRunningSessions(
	reason: string
): Promise<string[]> {
	const rows = await db
		.update(farmSessions)
		.set({
			finishedAt: sql`now()`,
			status: "failed",
			statusReason: reason,
		})
		.where(inArray(farmSessions.status, [...FARM_SESSION_ACTIVE_STATUSES]))
		.returning({ id: farmSessions.id });
	return rows.map((row) => row.id);
}

/**
 * 库里还活着的会话数（starting + running + finishing）。
 *
 * ⚠️ **配额闸门不该用它**：真相在 farm 的内存注册表里，这里的数字会被崩溃残留的
 * 孤儿行虚高（启动对账之前尤其如此）。它服务的是控制面的容量展示与告警
 * ——「现在有几条在跑」这个给人看的数字。
 */
export async function countActiveSessions(): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(farmSessions)
		.where(inArray(farmSessions.status, [...FARM_SESSION_ACTIVE_STATUSES]));
	return row?.value ?? 0;
}
