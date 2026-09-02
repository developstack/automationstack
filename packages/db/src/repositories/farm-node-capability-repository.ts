/**
 * 节点**能力清单**的落库与「重新探测」意向标记（plan §12：节点是主体）。
 *
 * 与 `farm-node-repository.ts` 同一张表，拆成两个文件有两条理由，第二条才是主要的：
 * - 原文件加上这三个函数会越过仓库 300 行的上限（scripts/check-file-rules.js）；
 * - 切面本身是干净的：那边全是**管理员对着表单改的四项**（名字 / 后端 / 槽位 /
 *   开关），调用方是请求路径；这边是**机器与 farm 之间来回的那三列**，调用方是
 *   farm 的轮询拍与 agent 报到。与 `farm-session-repository` /
 *   `farm-session-reaper-repository` 的切法同源。
 *
 * 为了不惊动任何调用方，`farm-node-repository.ts` 把这三个符号原样 re-export：
 * 现有 import 路径一个字都不用改。
 *
 * ## 这里写的东西**不参与调度**
 *
 * 派活读的是 farm 内存注册表里的活值，这三列只服务管理页（完整分工见
 * `schema/farm-nodes.ts` 顶部那一段）。所以本文件里没有任何一处按能力筛节点的
 * 查询——真要在库里筛，筛出来的也是一份可能已经过期的答案。
 */

import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";
import { asc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "../index";
import { farmNodes } from "../schema/farm-nodes";

/**
 * 记一次探测结果：写清单、盖时刻，并**顺手清掉 `refreshRequestedAt`**。
 *
 * 三件事必须在同一条 UPDATE 里，不能分两次发：分开写的话，中间那一瞬库里是
 * 「新清单 + 仍挂着的重新探测标记」，farm 的下一拍会照着标记再探一遍——一次点击
 * 探两次，而且这种重复只在两次写之间的窗口里出现，查起来只能靠猜。
 *
 * 清标记不看它是不是这次下令引起的：就算是 agent 自己重连时顺带上报的，那份
 * 清单也已经是新的了，管理员想要的结果（看到最新的能力）已经达成——留着标记
 * 只会让 farm 再白探一次。
 *
 * 行不存在就是**空操作**，与 `touchNodeLastSeen` 同规，所以这个函数对调用方永远
 * 成功：它跑在 farm 的连接维持路径上（agent 报到 / 轮询拍），那条路径上多一个
 * 需要处理的失败分支，收益是零——节点刚被管理员删掉这件事，farm 下一拍自然
 * 就会从别处知道。
 *
 * 时刻取 `now()` 而不是 Node 的 `new Date()`，也不取 `capabilities.detectedAtEpochSec`：
 * 前者与 `createdAt` 的 `defaultNow()` 同源，免得多台机器的时钟偏差让「探测于
 * 未来」出现在界面上；后者是**节点那台机器的钟**，那正是最不该被信任的一个。
 * 节点自己的时刻仍原样留在 jsonb 里，两者对不上时反而是一条有用的线索。
 */
export async function saveNodeCapabilities(
	id: string,
	capabilities: NodeCapabilities
): Promise<void> {
	await db
		.update(farmNodes)
		.set({
			capabilities,
			capabilitiesUpdatedAt: sql`now()`,
			refreshRequestedAt: null,
		})
		.where(eq(farmNodes.id, id));
}

/**
 * 控制面下令「重新探一次」：置**意向标记**，真正的探测由 farm 的下一拍执行。
 * 返回是否命中一行（`false` = 节点不存在，路由据此给 NOT_FOUND）。
 *
 * 与 `requestKill` 逐字同款的两处：`coalesce` 保留第一次的时刻——重复下令对
 * 控制面是幂等意图，第二次点不该报错，而「从下令到真的探完花了多久」只有保留
 * 第一次才算得出来；以及**这里不去碰任何一台真机**（D3），控制面与 farm 是两个
 * 进程，WS 连接握在 farm 手里。
 *
 * 刻意不筛 `enabled`：停用的机器照样连着、照样能探，而管理员想知道一台停用中的
 * 机器上装了什么，恰恰是他决定要不要重新启用它的依据。筛掉的话，那台机器的能力
 * 清单会永远停在停用前的那一份。
 */
export async function requestNodeRefresh(id: string): Promise<boolean> {
	const rows = await db
		.update(farmNodes)
		.set({
			refreshRequestedAt: sql`coalesce(${farmNodes.refreshRequestedAt}, now())`,
		})
		.where(eq(farmNodes.id, id))
		.returning({ id: farmNodes.id });
	return rows.length > 0;
}

/**
 * farm 每一拍要重新探测的节点 id（控制面下过令、还没被 `saveNodeCapabilities`
 * 清掉的那些）。
 *
 * 按下令时刻升序：先下令的先探，一次批量点击的延迟分布因此是可预期的。
 *
 * **不筛在线**：库里没有可信的在线判据（`lastSeenAt` 只是个近似值，见 schema），
 * 而 farm 手上有真连接——谁连着由它说了算，这里多筛一道只会得出与它不同的答案。
 * 离线节点的标记就这么挂着，它回来那一拍自然被消费掉，语义正是「等它上线再探」。
 */
export async function listRefreshRequestedNodeIds(): Promise<string[]> {
	const rows = await db
		.select({ id: farmNodes.id })
		.from(farmNodes)
		.where(isNotNull(farmNodes.refreshRequestedAt))
		.orderBy(asc(farmNodes.refreshRequestedAt));
	return rows.map((row) => row.id);
}
