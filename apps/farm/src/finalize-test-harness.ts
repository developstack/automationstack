/**
 * 收尾用例共用的脚手架：假的 deps、假的槽位、真的临时工作目录。
 *
 * 从 `finalize.test.ts` 拆出来：那份文件到了 378 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。用例按段落分成了 `finalize.test.ts`（第 ①/② 段）
 * 与 `finalize-artifacts.test.ts`（第 ③ 段与死因），两边要用同一套假实现——照抄一份
 * 的话，哪天 `SessionLifecycleDeps` 多一个字段就会有一边被漏掉。
 *
 * 为什么这些依赖是假的（不连 Docker、不连库、不连 R2），而 workDir 是真的：
 * 见 `finalize.test.ts` 的文件头。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AcquiredSlot } from "@automationstack/browser-slots";
import type {
	UpdateFarmSessionStatusInput,
	UpdateFarmSessionStatusResult,
} from "@automationstack/db/repositories/farm-session-repository";
import type { NewFarmSessionArtifact } from "@automationstack/db/schema/farm-session-artifacts";
import { afterEach, beforeEach, expect, vi } from "vitest";

import type { SessionLifecycleDeps } from "./finalize";
import type { RecorderArtifactFile } from "./recorder/types";
import { createSessionRegistry } from "./scheduler";
import { createLiveSession, type LiveSession } from "./session";
import type { ArtifactStorage } from "./storage";

export interface Harness {
	deps: SessionLifecycleDeps;
	insertedRows: NewFarmSessionArtifact[];
	putCalls: string[];
	statusWrites: { input: UpdateFarmSessionStatusInput }[];
}

interface HarnessOptions {
	collected?: RecorderArtifactFile[];
	putFails?: boolean;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
	const statusWrites: { input: UpdateFarmSessionStatusInput }[] = [];
	const insertedRows: NewFarmSessionArtifact[] = [];
	const putCalls: string[] = [];

	const storage: ArtifactStorage = {
		mode: "local",
		put: (input) => {
			putCalls.push(input.filePath);
			if (options.putFails === true) {
				return Promise.reject(new Error("模拟上传失败"));
			}
			return Promise.resolve({
				contentType: input.contentType,
				sizeBytes: 42,
				storageKey: `farm/${input.sessionId}/x`,
			});
		},
	};

	const deps: SessionLifecycleDeps = {
		artifacts: {
			insertArtifact: (row) => {
				insertedRows.push(row);
				return Promise.resolve(row);
			},
		},
		collectRecorderArtifacts: () => Promise.resolve(options.collected ?? []),
		// 测试里永远有空位：容量策略是复合源那侧的事，收尾用例不关心它。
		registry: createSessionRegistry({ hasFreeSlot: () => true }),
		sessions: {
			updateSessionStatus: (
				_id: string,
				input: UpdateFarmSessionStatusInput
			): Promise<UpdateFarmSessionStatusResult> => {
				statusWrites.push({ input });
				return Promise.resolve({ kind: "not-found" });
			},
		},
		storage,
	};
	deps.registry.openIntake();
	return { deps, insertedRows, putCalls, statusWrites };
}

export interface FakeSlot extends AcquiredSlot {
	released: number;
}

export function makeSlot(log = "chromedriver 起来了\n"): FakeSlot {
	const slot: FakeSlot = {
		browserArgs: [],
		cdpDebugPort: 9222,
		cdpHttpEndpoint: "http://127.0.0.1:9222",
		containerId: "container-abc",
		readLogs: () => Promise.resolve(log),
		release: () => {
			slot.released += 1;
			return Promise.resolve();
		},
		released: 0,
		wdEndpoint: "http://127.0.0.1:4444",
	};
	return slot;
}

let workDir = "";

/** 当前用例的临时工作目录。原本是模块级变量，跨文件之后只能靠一个读取口传递。 */
export function currentWorkDir(): string {
	return workDir;
}

/** 每个用例一个真临时目录，跑完删掉。两个测试文件各自在顶层调用一次。 */
export function setupTempWorkDir(): void {
	beforeEach(async () => {
		workDir = await mkdtemp(join(tmpdir(), "farm-finalize-"));
	});

	afterEach(async () => {
		await rm(workDir, { force: true, recursive: true });
	});
}

export function makeSession(deps: SessionLifecycleDeps): LiveSession {
	const session = createLiveSession({
		browser: "chromium",
		id: "11111111-1111-1111-1111-111111111111",
		idleTimeoutMs: null,
		image: "browser:latest",
		maxLifetimeMs: 60_000,
		onExpired: () => undefined,
		projectId: "project-1",
		protocol: "webdriver",
		version: "latest",
		workDir,
	});
	deps.registry.register(session);
	return session;
}

/** 终态那一次写入（第 ③ 段）。`finishing` 是第 ② 段的中间写入，不算。 */
function terminalWrite(
	harness: Harness
): UpdateFarmSessionStatusInput | undefined {
	return harness.statusWrites
		.map((item) => item.input)
		.find((input) => input.status !== "finishing");
}

export async function waitForTerminal(
	harness: Harness
): Promise<UpdateFarmSessionStatusInput> {
	await vi.waitFor(() => expect(terminalWrite(harness)).toBeDefined(), {
		timeout: 5000,
	});
	const input = terminalWrite(harness);
	if (input === undefined) {
		throw new Error("终态写入没有发生");
	}
	return input;
}
