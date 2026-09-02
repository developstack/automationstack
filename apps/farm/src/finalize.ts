import { runArtifactPhase } from "./finalize-artifacts";
import {
	type FinalizeSessionInput,
	stopRecorderQuietly,
	withBudget,
	writeStatus,
} from "./finalize-support";
import type { LiveSession } from "./session";

/**
 * 会话收尾：**唯一**一条把会话送进终态的路径（plan §5.2）。
 *
 * 正常 DELETE、空闲/寿命超时、上游断链、reaper 强杀、优雅关停——五个触发源全部
 * 汇到这一个函数。多一条收尾路径就多一份「容器有没有放掉」的判断，而容器泄漏是
 * 这个服务最贵的失效：它不报错，只是把宿主机的内存慢慢吃光。
 *
 * ## 为什么分三段
 *
 * 收尾要做的事分属两个世界：一部分**必须趁容器还活着**（截图、读容器日志、让
 * recorder 把缓冲 flush 掉），一部分**必须等容器死了才划算**（上传产物——那可能
 * 是几十 MB 的 HAR，传它的几十秒里没有任何理由继续占着一个浏览器容器和一个并发
 * 槽位）。硬拼在一起就是「为了传文件多留一个容器」，而并发上限只有个位数。
 *
 * 于是：
 * - **① 容器存活期**（总预算 10s）：截图 → 读日志 → recorder.stop()。
 *   限时是因为这三步都在跟一个可能已经半死的容器说话，任何一步挂死都会把整条
 *   会话卡在 `finishing`，连带占着槽位——那正是这一段想避免的事。
 * - **② 立刻放手**：release 容器、摘出注册表、库里记 `finishing`。槽位在这一刻
 *   就还给了下一条会话。
 * - **③ 异步落产物**：收集 → 上传 → 写产物行 → 删 workDir → 写终态。
 *   实现搬去了 `finalize-artifacts.ts`（本文件曾到 392 行，越过仓库 300 行上限，
 *   见 scripts/check-file-rules.js），两边共用的端口类型与小工具在
 *   `finalize-support.ts`。
 *
 * ## 偏离契约：终态在第 ③ 段写，不在第 ② 段写
 *
 * 原计划是「② 立刻置终态，③ 失败时把 `artifacts_upload_failed` 补记进
 * statusReason」。但 `updateSessionStatus` 的终态守卫（在 db 层，SQL 的 WHERE 里）
 * 会挡下**任何**对已终态行的写入并回 `settled`——补记根本落不进去，而 packages/db
 * 不许改。两个选项：让 db 放宽守卫（那道守卫恰恰是幂等的另一半，是防 reaper 与
 * 收尾并发的东西，不能动），或者把终态推迟到理由齐了再写一次。选了后者：
 *
 * - 代价：上传窗口内（通常几百毫秒到几秒）库里那一行是 `finishing`，而容器其实
 *   已经没了；farm 若在这个窗口里被 kill -9，那一行会留在 `finishing`，由下次
 *   启动的 `markOrphanedRunningSessions` 扫成 `orphaned`。
 * - 收益：终态**只写一次**，且写下去的时候 `statusReason` 是完整的。中间态多存在
 *   几秒，好过终态里永远缺一条死因。
 *
 * ## 幂等
 *
 * 两道闸门，缺一不可：内存这道是 `session.beginFinishing()`（防同进程内两个触发
 * 源撞车，比如超时计时器和客户端 DELETE 同时到），库那道是 `updateSessionStatus`
 * 的 `settled` 返回（防进程重启后 reaper 与残留写入撞车）。这里对 `settled`
 * 的态度是：记一条 debug 就算了，**不重试、不覆盖**——别人已经把它结算了。
 */

/** 第 ① 段的总预算。三步都在跟一个可能半死的容器说话，不能无限等。 */
const CONTAINER_PHASE_BUDGET_MS = 10_000;

// 类型的声明搬去了 finalize-support.ts，这里按原路径补回它们的导出面
// （`launch.ts`、`finalize.test.ts` 与装配层都按 `./finalize` 引用）。
export type {
	ArtifactRowPort,
	FinalizeSessionInput,
	SessionLifecycleDeps,
	SessionStatusPort,
} from "./finalize-support";

/**
 * 第 ① 段。三步各自 try/catch：容器可能已经 OOM 被内核杀了，那时截图会超时、
 * 读日志会 404，但**剩下能做的仍然要做**——恰恰是这种会话的容器日志最有价值。
 */
async function runContainerPhase(session: LiveSession): Promise<string | null> {
	if (session.recorder !== null && !session.screenshotCaptured) {
		session.screenshotCaptured = true;
		try {
			await session.recorder.captureScreenshot("final");
		} catch (error) {
			console.warn(`收尾截图失败 session=${session.id}`, error);
		}
	}
	let log: string | null = null;
	if (session.slot !== null) {
		try {
			log = await session.slot.readLogs();
		} catch (error) {
			console.warn(`读取容器日志失败 session=${session.id}`, error);
		}
	}
	await stopRecorderQuietly(session);
	return log;
}

/** 第 ② 段的放手动作。release 失败只能记日志——容器泄漏由 reaper 的标签扫描兜底。 */
async function releaseSlot(session: LiveSession): Promise<void> {
	const { slot } = session;
	if (slot === null) {
		return;
	}
	session.slot = null;
	try {
		await slot.release();
	} catch (error) {
		console.error(
			`释放容器失败 session=${session.id} container=${slot.containerId}，等待 reaper 兜底`,
			error
		);
	}
}

/**
 * 收尾入口。**同步返回于第 ② 段结束时**：容器已放、槽位已还、库里已记
 * `finishing`；第 ③ 段在后台继续跑。
 *
 * 调用方因此可以 `await` 它而不必担心被一次几十 MB 的上传拖住——WebDriver 的
 * DELETE 响应、CDP 的连接关闭回调都需要这个性质。
 */
export async function finalizeSession(
	input: FinalizeSessionInput
): Promise<void> {
	const { deps, session } = input;
	// 内存这道幂等闸门。抢不到的那个调用方什么都不做——不是失败，是「别人在收了」。
	if (!session.beginFinishing()) {
		return;
	}
	if (input.reason !== undefined) {
		session.addStatusReason(input.reason);
	}
	const containerLog = await withBudget(
		() => runContainerPhase(session),
		CONTAINER_PHASE_BUDGET_MS,
		null
	);
	const containerId = session.slot?.containerId ?? null;
	await releaseSlot(session);
	deps.registry.remove(session.id);
	await writeStatus(deps, session, {
		status: "finishing",
		...(containerId === null ? {} : { containerId }),
	});
	// 第 ③ 段刻意不 await：它是「产物最终一致」，不是收尾的一部分。
	// biome-ignore lint/complexity/noVoid: 同上，void 标记这个不等待是有意的
	void runArtifactPhase(input, containerLog);
}
