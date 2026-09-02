/**
 * 收尾流程的地基：依赖端口的类型，加上三段收尾都要用的两个小工具。
 *
 * 从 `finalize.ts` 拆出来：那份文件到了 392 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里是被依赖方向逼出来的——第 ③ 段（产物）
 * 搬进 `finalize-artifacts.ts` 之后，它与 `finalize.ts` 都要用 `withBudget()` 与
 * `writeStatus()`。这两个函数留在任何一边都会形成一条运行时循环引用，所以它们
 * （以及两边都要引的那几个类型）沉到这一层来。
 */
import type {
	UpdateFarmSessionStatusInput,
	UpdateFarmSessionStatusResult,
} from "@automationstack/db/repositories/farm-session-repository";
import type { FarmSessionStatus } from "@automationstack/db/schema/farm-enums";
import type { NewFarmSessionArtifact } from "@automationstack/db/schema/farm-session-artifacts";

import type { CollectRecorderArtifacts } from "./recorder/types";
import type { SessionRegistry } from "./scheduler";
import type { LiveSession } from "./session";
import type { ArtifactStorage } from "./storage";

/**
 * 库这一侧的两个写入口，以**接口**而不是直接 import 的形式出现。
 *
 * 不是为了将来换实现（不会换），是为了让状态机与收尾逻辑能在没有数据库的进程里
 * 被单测跑起来。这两件事恰恰是最难在真环境里复现的：幂等竞态、`settled` 分支、
 * 上传失败后的死因拼接——真跑一遍 Docker 只能覆盖 happy path。
 */
export interface SessionStatusPort {
	updateSessionStatus: (
		id: string,
		input: UpdateFarmSessionStatusInput
	) => Promise<UpdateFarmSessionStatusResult>;
}

export interface ArtifactRowPort {
	insertArtifact: (row: NewFarmSessionArtifact) => Promise<unknown>;
}

/** 收尾要用到的全部外部依赖。装配层建一次，四个触发源共用同一份。 */
export interface SessionLifecycleDeps {
	artifacts: ArtifactRowPort;
	collectRecorderArtifacts: CollectRecorderArtifacts;
	registry: SessionRegistry;
	sessions: SessionStatusPort;
	storage: ArtifactStorage;
}

export interface FinalizeSessionInput {
	deps: SessionLifecycleDeps;
	/** 死因，落 `status_reason`。正常结束传 undefined。 */
	reason?: string;
	session: LiveSession;
	status: FarmSessionStatus;
}

/**
 * 限时执行：超时不抛，回 `fallback`。
 *
 * 刻意不用 `Promise.race` 加 reject——收尾里每一步的失败都是「少一份产物」而不是
 * 「收尾失败」，用异常表达它意味着每个调用点都要 try/catch 一次。
 */
export async function withBudget<T>(
	work: () => Promise<T>,
	budgetMs: number,
	fallback: T
): Promise<T> {
	let timer: NodeJS.Timeout | null = null;
	const guard = new Promise<T>((resolve) => {
		timer = setTimeout(() => resolve(fallback), budgetMs).unref();
	});
	try {
		return await Promise.race([work(), guard]);
	} finally {
		if (timer !== null) {
			clearTimeout(timer);
		}
	}
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms).unref();
	});
}

/**
 * 「我们主动停」的那一次 stop：在浏览器**预期之中**要退出之前先把 recorder 停掉。
 *
 * recorder 是第二条 browser-level CDP 连接。它断开时会先重连一次，仍失败才把
 * `recorder_detached` 上报给会话（见 recorder/client.ts 的 handleClose）。而正常
 * 收尾里浏览器本来就要死——WebDriver 的 DELETE 一到 chromedriver、CDP 客户端一关
 * 连接，Chrome 就没了。此时若 recorder 还活着，它会把这次预期之中的断开当成故障，
 * 于是**每一条正常会话**的 status_reason 里都躺着一个 recorder_detached，这个字段
 * 就此变成噪音、再也分不出真掉线。
 *
 * 先 stop 等于先把「这是我们停的」说出口：`stop()` 同步置上 stopped 标志，之后到达
 * 的 close 事件被 handleClose 的第一条判据直接吞掉，不会重连也不会上报。
 *
 * 失败只记日志：停不掉 recorder 不该阻断收尾，**也不该因此写任何死因**——
 * `recorderDetached` 是 recorder 自己观测到的事实，不由这里替它下结论。
 */
export async function stopRecorderQuietly(session: LiveSession): Promise<void> {
	const { recorder } = session;
	if (recorder === null) {
		return;
	}
	try {
		await recorder.stop();
	} catch (error) {
		console.warn(`停止 recorder 失败 session=${session.id}`, error);
	}
}

/** 库写入统一包一层：`settled` 与异常都不该把收尾打断（容器已经放掉了，无可回滚）。 */
export async function writeStatus(
	deps: SessionLifecycleDeps,
	session: LiveSession,
	input: UpdateFarmSessionStatusInput
): Promise<void> {
	try {
		const result = await deps.sessions.updateSessionStatus(session.id, input);
		if (result.kind !== "updated") {
			console.debug(
				`会话状态写入被跳过 session=${session.id} kind=${result.kind}`
			);
		}
	} catch (error) {
		console.error(`写入会话状态失败 session=${session.id}`, error);
	}
}
