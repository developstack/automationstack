import type { FarmSessionStatus } from "../schema/farm-enums";

/**
 * 会话状态迁移的**唯一判据**（phase4 §5.2）。
 *
 * 独立成一个不 import `../index` 的纯模块，与 `test-run-status-core.ts` 同一套理由：
 * 判据要能被逐条钉死，而它的失效方式在真库上极难复现——收尾路径与 reaper 是两个
 * 触发源，真要撞上得让容器恰好在收尾那 10 秒里被判过期。
 *
 * ## 为什么规则只有「终态不可再迁」这一条
 *
 * 刻意**不做**一张 `from → to` 的白名单矩阵。会话的合法前驱在 farm 内存状态机里已经
 * 定死了（数据面自己就是那个状态机），库这一层要防的是**另一件事**：同一条会话被
 * 两个触发源并发收尾——正常路径（客户端 DELETE / WS 关闭）刚把它写成 `completed`，
 * reaper 那一拍已经在飞行中，紧接着把它改成 `killed`。事后看这一行，死因就是错的。
 *
 * 一张全矩阵在这里是负资产：它会把 `starting → finishing`（容器还没探活成功、客户端
 * 就断了）这类**真实存在的**跳跃判成非法，于是那条会话永远停在 `starting`，
 * 占着配额直到人工介入。先到者赢、终态封口，是这里唯一站得住的规则。
 *
 * 这份判据必须与 `farm-session-repository.ts` 里那条 UPDATE 的 WHERE 逐字对应
 * ——真正生效的是 SQL 那一份（并发裁决只能发生在数据库），这里的常量是它的可测镜像，
 * 两处一旦分叉，测试会全绿而线上照样双写。
 */
export const FARM_SESSION_TERMINAL_STATUSES: readonly FarmSessionStatus[] = [
	"completed",
	"failed",
	"timed_out",
	"killed",
];

/**
 * 还在占着容器槽位的三个状态。配额闸门数的是它们，farm 启动对账要收敛的也是它们。
 *
 * 它恒等于终态集合的补集，独立列出来而不是现算，是为了让 SQL 的 `in (...)` 与内存
 * 里的判断用的是同一组取值。「两个集合恰好把枚举划分干净」由单测守着——加了新状态
 * 却忘了归类时，那条测试是唯一会喊出来的地方。
 */
export const FARM_SESSION_ACTIVE_STATUSES: readonly FarmSessionStatus[] = [
	"starting",
	"running",
	"finishing",
];

/** 会话是否已经落定。终态行除了事后补写产物之外，不再接受任何写入。 */
export function isFarmSessionTerminal(status: FarmSessionStatus): boolean {
	return FARM_SESSION_TERMINAL_STATUSES.includes(status);
}
