import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { FarmSlotMode } from "./types";

/**
 * **槽位目录即 label**：本地进程槽位的真相源约定。
 *
 * Docker 那边，reaper 判杀只凭容器 label（`as.farm.session` / `as.farm.expires_at`），
 * 好处是 farm 内存丢了、DB 挂了也照收——判据活在**farm 进程之外**。本地进程没有
 * label 这种东西，所以这里用文件系统复刻同一个性质：
 *
 * ```
 * <FARM_WORK_DIR>/local-slots/<sessionId>/
 *   meta.json   → { expiresAtEpochSec, mode, pid }   ≈ 那三个 label
 *   profile/    → 这条会话专属的 --user-data-dir
 * ```
 *
 * 一一对应关系：**目录名 = `as.farm.session`**，**目录存在 = `as.farm.managed=true`**，
 * **meta.expiresAtEpochSec = `as.farm.expires_at`**，**meta.pid = 那个能杀掉它的句柄**
 * （容器那边这个角色由容器 id 扮演）。于是 farm 被 kill -9 之后重启，
 * 启动对账扫这个目录就能把上一代进程留下的 Chrome 全部收掉——与容器模式同构。
 *
 * 这个约定还有一条隐含要求，写在 `local.ts` 的 acquire 里：浏览器**必须**用
 * `profile/` 当 user-data-dir。不然孤儿清扫杀得掉进程，却删不掉它散在
 * `/var/folders/...` 下的临时 profile。
 */

/**
 * `containerId` 的本地形态。前缀是给人看的：这个 id 会原样落进
 * `farm_sessions.container_id` 与日志，一眼要能看出它不是一个 Docker id。
 */
const LOCAL_CONTAINER_PREFIX = "local-";

export const SLOT_META_FILE = "meta.json";
export const SLOT_PROFILE_DIR = "profile";

/** meta.json 的内容。字段少到可以一眼看完是刻意的——它要能被人手工读懂。 */
export interface SlotMeta {
	expiresAtEpochSec: number;
	mode: FarmSlotMode;
	/**
	 * 进程组 id。**可空**：目录要在 spawn **之前**就带着 meta 建好
	 * （否则 reaper 恰好在这两步之间扫过来，会看见一个「没有 meta 的目录」并把
	 * 正在启动的会话当孤儿清掉），那一刻还没有 pid。
	 */
	pid: number | null;
}

export function slotDirOf(root: string, sessionId: string): string {
	return join(root, sessionId);
}

export function profileDirOf(slotDir: string): string {
	return join(slotDir, SLOT_PROFILE_DIR);
}

export function containerIdOf(sessionId: string): string {
	return `${LOCAL_CONTAINER_PREFIX}${sessionId}`;
}

/** `local-<sessionId>` → `<sessionId>`。不带前缀的原样返回（手工传进来的 id）。 */
export function sessionIdOf(containerId: string): string {
	return containerId.startsWith(LOCAL_CONTAINER_PREFIX)
		? containerId.slice(LOCAL_CONTAINER_PREFIX.length)
		: containerId;
}

export async function writeSlotMeta(
	slotDir: string,
	meta: SlotMeta
): Promise<void> {
	await writeFile(join(slotDir, SLOT_META_FILE), JSON.stringify(meta), "utf8");
}

/** 建槽位目录（含 profile/）并先落一份 meta。顺序理由见 `SlotMeta.pid`。 */
export async function createSlotDir(
	slotDir: string,
	meta: SlotMeta
): Promise<void> {
	await mkdir(profileDirOf(slotDir), { recursive: true });
	await writeSlotMeta(slotDir, meta);
}

function parseMeta(raw: unknown): SlotMeta | null {
	if (typeof raw !== "object" || raw === null) {
		return null;
	}
	const { expiresAtEpochSec, mode, pid } = raw as Record<string, unknown>;
	const validMode = mode === "webdriver" || mode === "cdp";
	const validPid = pid === null || typeof pid === "number";
	if (!(validMode && validPid) || typeof expiresAtEpochSec !== "number") {
		return null;
	}
	return { expiresAtEpochSec, mode, pid: pid as number | null };
}

/**
 * 读一个槽位的 meta。**读不出来一律 null**（文件缺失、JSON 坏了、字段不对）。
 *
 * 调用方对 null 的处理必须是「照杀」而不是「跳过」，与容器 label 写坏时同一条
 * 纪律（`types.ts` 的 `ManagedContainer`）：一个 meta 写坏的槽位若能因此
 * 逃过回收，它就永远赖在机器上了。
 */
export async function readSlotMeta(slotDir: string): Promise<SlotMeta | null> {
	try {
		const raw: unknown = JSON.parse(
			await readFile(join(slotDir, SLOT_META_FILE), "utf8")
		);
		return parseMeta(raw);
	} catch {
		return null;
	}
}

/** 槽位根目录下的所有槽位目录名（= sessionId）。根目录不存在就是「一个都没有」。 */
export async function listSlotDirNames(root: string): Promise<string[]> {
	try {
		const entries = await readdir(root, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map(({ name }) => name);
	} catch {
		return [];
	}
}

/** 删槽位目录。已经不在也算成功——回收路径必须幂等。 */
export async function removeSlotDir(slotDir: string): Promise<void> {
	await rm(slotDir, { force: true, recursive: true });
}
