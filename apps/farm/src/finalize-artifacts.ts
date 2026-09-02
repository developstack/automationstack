/**
 * 收尾的第 ③ 段：收集 → 上传 → 写产物行 → 删 workDir → 写终态。
 *
 * 从 `finalize.ts` 拆出来：那份文件到了 392 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为第 ③ 段与前两段之间
 * 本来就有一道真实的边界——它在**容器已经放掉之后**跑，是后台的「最终一致」，
 * 前两段则是同步的、还捏着容器句柄的。三段的整体设计与那条「终态推迟到第 ③ 段
 * 才写」的偏离说明，仍留在 `finalize.ts` 的文件头。
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	type FinalizeSessionInput,
	type SessionLifecycleDeps,
	sleep,
	withBudget,
	writeStatus,
} from "./finalize-support";
import type { RecorderArtifactFile } from "./recorder/types";
import type { LiveSession } from "./session";

/**
 * 第 ③ 段的总预算。超了就放弃等待（后台任务自己跑完，产物行仍会补上），
 * 先把终态写掉——一条会话不该因为 HAR 传得慢而在列表里显示成「收尾中」到天荒地老。
 */
const ARTIFACT_PHASE_BUDGET_MS = 120_000;

/** 单个产物的上传尝试次数。R2 偶发 5xx 与网络抖动值得重试，签名错不值得。 */
const UPLOAD_ATTEMPTS = 3;

/** 重试退避基数，第 n 次失败后等 n × 这个值。 */
const UPLOAD_RETRY_BASE_MS = 500;

/** 容器日志在 workDir 里的文件名，也是它上传后的对象名。 */
const CONTAINER_LOG_FILE = "container.log";

/** 产物上传最终失败时补记的死因，约定见 `farm-session-artifact-repository`。 */
const REASON_UPLOAD_FAILED = "artifacts_upload_failed";

/** 观测掉线的死因（§5.5）。只在没有别的死因时才记，见下。 */
const REASON_RECORDER_DETACHED = "recorder_detached";

/** 把容器日志落成 workDir 下的一个文件，好让它与 recorder 产物走同一条上传路径。 */
async function writeContainerLog(
	session: LiveSession,
	log: string
): Promise<RecorderArtifactFile | null> {
	const path = join(session.workDir, CONTAINER_LOG_FILE);
	try {
		await mkdir(session.workDir, { recursive: true });
		await writeFile(path, log, "utf8");
		return {
			contentType: "text/plain; charset=utf-8",
			kind: "container_log",
			path,
		};
	} catch (error) {
		console.warn(`落盘容器日志失败 session=${session.id}`, error);
		return null;
	}
}

/** 上传一个产物并写行。成功 true，三次都失败 false（不抛：一个产物不该拖垮其它的）。 */
async function uploadArtifact(
	deps: SessionLifecycleDeps,
	session: LiveSession,
	file: RecorderArtifactFile
): Promise<boolean> {
	let attempt = 0;
	while (attempt < UPLOAD_ATTEMPTS) {
		attempt += 1;
		try {
			// biome-ignore lint/performance/noAwaitInLoops: 重试循环本来就是串行的——上一次失败才有下一次
			const stored = await deps.storage.put({
				contentType: file.contentType,
				filePath: file.path,
				sessionId: session.id,
			});
			await deps.artifacts.insertArtifact({
				contentType: stored.contentType,
				kind: file.kind,
				meta: { ...file.meta, storage: deps.storage.mode },
				sessionId: session.id,
				sizeBytes: stored.sizeBytes,
				storageKey: stored.storageKey,
			});
			return true;
		} catch (error) {
			console.warn(
				`产物上传失败（第 ${attempt}/${UPLOAD_ATTEMPTS} 次）session=${session.id} file=${file.path}`,
				error
			);
			if (attempt < UPLOAD_ATTEMPTS) {
				await sleep(UPLOAD_RETRY_BASE_MS * attempt);
			}
		}
	}
	return false;
}

/** 收集清单：容器日志 + recorder 产物。收集本身失败不算上传失败，只是少几份。 */
async function collectFiles(
	deps: SessionLifecycleDeps,
	session: LiveSession,
	containerLog: string | null
): Promise<RecorderArtifactFile[]> {
	const files: RecorderArtifactFile[] = [];
	if (containerLog !== null && containerLog.length > 0) {
		const logFile = await writeContainerLog(session, containerLog);
		if (logFile !== null) {
			files.push(logFile);
		}
	}
	try {
		files.push(...(await deps.collectRecorderArtifacts(session.workDir)));
	} catch (error) {
		console.warn(`收集 recorder 产物失败 session=${session.id}`, error);
	}
	return files;
}

/** 逐个上传。**串行**：并发上传几十 MB 的 HAR 只会让本就吃紧的出网带宽更抖。 */
async function uploadAll(
	deps: SessionLifecycleDeps,
	session: LiveSession,
	files: RecorderArtifactFile[]
): Promise<boolean> {
	let allOk = true;
	for (const file of files) {
		// biome-ignore lint/performance/noAwaitInLoops: 刻意串行——收尾期的带宽要让给还在跑的会话，见文件头
		const ok = await uploadArtifact(deps, session, file);
		allOk = allOk && ok;
	}
	return allOk;
}

/**
 * workDir 一律删干净，**哪怕上传失败**。
 *
 * 留着它没有任何人会来捡：没有重传队列，farm 重启后连这条会话在内存里都不存在了。
 * 不删的结果是磁盘被失败的会话慢慢填满，而那种失败恰恰倾向于连续发生
 * （R2 凭据配错的话，每一条会话都会留下一份）。
 */
async function cleanWorkDir(session: LiveSession): Promise<void> {
	try {
		await rm(session.workDir, { force: true, recursive: true });
	} catch (error) {
		console.warn(`清理工作目录失败 session=${session.id}`, error);
	}
}

/** 第 ③ 段。跑完（或超预算）之后必然写一次终态，理由见文件头的偏离说明。 */
export async function runArtifactPhase(
	input: FinalizeSessionInput,
	containerLog: string | null
): Promise<void> {
	const { deps, session, status } = input;
	const uploaded = await withBudget(
		async () => {
			const files = await collectFiles(deps, session, containerLog);
			const ok = await uploadAll(deps, session, files);
			await cleanWorkDir(session);
			return ok;
		},
		ARTIFACT_PHASE_BUDGET_MS,
		false
	);
	if (!uploaded) {
		session.addStatusReason(REASON_UPLOAD_FAILED);
	}
	// 观测掉线是次要信息：只在这条会话没有别的死因时才写，免得
	// `idle_timeout,recorder_detached` 这种复合值把按死因分组的统计打散（§5.5）。
	if (session.recorderDetached && session.statusReason() === null) {
		session.addStatusReason(REASON_RECORDER_DETACHED);
	}
	const reason = session.statusReason();
	await writeStatus(deps, session, {
		finishedAt: new Date(),
		status,
		...(reason === null ? {} : { statusReason: reason }),
	});
	session.settle();
}
