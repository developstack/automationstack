import { describe, expect, it, vi } from "vitest";

import { finalizeSession } from "./finalize";
import {
	makeHarness,
	makeSession,
	makeSlot,
	setupTempWorkDir,
	waitForTerminal,
} from "./finalize-test-harness";
import type { RecorderHandle } from "./recorder/types";

/**
 * 收尾流程的用例。
 *
 * 这里验的全是**只在异常路径上才出现**的行为：容器已经半死时还能不能收到日志、
 * 两个触发源同时收尾会不会放两次容器、上传三次都失败之后死因是不是拼上去而不是
 * 盖掉原来那条。真容器上只跑得到 happy path，所以这些必须在这里钉死。
 *
 * provider、仓储、存储全部是假的：不连 Docker、不连库、不连 R2，只有工作目录是
 * 真的临时目录（收尾要往里写 container.log、跑完要把它删掉，这两件事值得用真
 * 文件系统验）。那套假实现在 `finalize-test-harness.ts`。
 *
 * 本文件只留前两段（同步、还捏着容器句柄的那一半）；第 ③ 段与死因的用例在
 * `finalize-artifacts.test.ts`——原本一个文件到了 378 行，越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。
 */

setupTempWorkDir();

describe("finalizeSession 第 ② 段：立刻放手", () => {
	it("释放容器、摘出注册表，并先写一条带 containerId 的 finishing", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		const slot = makeSlot();
		session.slot = slot;

		await finalizeSession({
			deps: harness.deps,
			session,
			status: "completed",
		});

		expect(slot.released).toBe(1);
		expect(harness.deps.registry.size()).toBe(0);
		expect(harness.statusWrites[0]?.input).toMatchObject({
			containerId: "container-abc",
			status: "finishing",
		});
		await waitForTerminal(harness);
	});

	it("重复调用是空操作：容器只放一次", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		const slot = makeSlot();
		session.slot = slot;

		await Promise.all([
			finalizeSession({ deps: harness.deps, session, status: "completed" }),
			finalizeSession({
				deps: harness.deps,
				reason: "idle_timeout",
				session,
				status: "timed_out",
			}),
		]);

		expect(slot.released).toBe(1);
		const terminal = await waitForTerminal(harness);
		expect(terminal.status).toBe("completed");
	});
});

describe("finalizeSession 第 ① 段：容器存活期", () => {
	it("没截过图就补一张收尾图，只截一次", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot();
		const labels: string[] = [];
		const recorder: RecorderHandle = {
			captureScreenshot: (label) => {
				labels.push(label);
				return Promise.resolve();
			},
			stop: () => Promise.resolve(),
		};
		session.recorder = recorder;

		await finalizeSession({ deps: harness.deps, session, status: "completed" });

		expect(labels).toEqual(["final"]);
		await waitForTerminal(harness);
	});

	it("DELETE 路径已经截过了就不再截第二张", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot();
		const capture = vi.fn(() => Promise.resolve());
		session.recorder = {
			captureScreenshot: capture,
			stop: () => Promise.resolve(),
		};
		session.screenshotCaptured = true;

		await finalizeSession({ deps: harness.deps, session, status: "completed" });

		expect(capture).not.toHaveBeenCalled();
		await waitForTerminal(harness);
	});

	it("截图失败不影响后面的读日志与 stop", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot();
		const stop = vi.fn(() => Promise.resolve());
		session.recorder = {
			captureScreenshot: () => Promise.reject(new Error("容器已经死了")),
			stop,
		};

		await finalizeSession({ deps: harness.deps, session, status: "failed" });

		expect(stop).toHaveBeenCalledTimes(1);
		const terminal = await waitForTerminal(harness);
		expect(terminal.status).toBe("failed");
	});
});
