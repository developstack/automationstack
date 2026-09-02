import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { finalizeSession } from "./finalize";
import {
	currentWorkDir,
	makeHarness,
	makeSession,
	makeSlot,
	setupTempWorkDir,
	waitForTerminal,
} from "./finalize-test-harness";

/**
 * 收尾第 ③ 段（产物）与死因拼接的用例。
 *
 * 从 `finalize.test.ts` 拆出来：原本一个文件到了 378 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为被测的实现本身就在
 * 这条缝上分开了——第 ③ 段跑在容器已经放掉之后，是后台的「最终一致」，实现在
 * `finalize-artifacts.ts`。整套假依赖的取舍见 `finalize.test.ts` 的文件头。
 */

setupTempWorkDir();

describe("finalizeSession 第 ③ 段：产物", () => {
	it("容器日志被落盘、上传并写成 container_log 产物行", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot("chromium crashed\n");

		await finalizeSession({ deps: harness.deps, session, status: "completed" });
		await waitForTerminal(harness);

		expect(harness.insertedRows).toHaveLength(1);
		expect(harness.insertedRows[0]).toMatchObject({
			kind: "container_log",
			sessionId: session.id,
			sizeBytes: 42,
		});
		// meta.storage 是详情页判断「这份能不能下载」的唯一依据。
		expect(harness.insertedRows[0]?.meta).toMatchObject({ storage: "local" });
	});

	it("recorder 产物与容器日志一起上传", async () => {
		const harPath = join(currentWorkDir(), "network.har");
		const harness = makeHarness({
			collected: [
				{ contentType: "application/json", kind: "har", path: harPath },
			],
		});
		const session = makeSession(harness.deps);
		session.slot = makeSlot();
		await writeFile(harPath, "{}", "utf8");

		await finalizeSession({ deps: harness.deps, session, status: "completed" });
		await waitForTerminal(harness);

		expect(
			harness.insertedRows
				.map((row) => row.kind)
				.sort((a, b) => a.localeCompare(b))
		).toEqual(["container_log", "har"]);
	});

	it("跑完把工作目录整个删掉", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot();

		await finalizeSession({ deps: harness.deps, session, status: "completed" });
		await waitForTerminal(harness);

		await expect(
			readFile(join(currentWorkDir(), "container.log"), "utf8")
		).rejects.toThrow();
	});

	it("上传三次都失败时补记 artifacts_upload_failed，不覆盖已有死因", async () => {
		const harness = makeHarness({ putFails: true });
		const session = makeSession(harness.deps);
		session.slot = makeSlot();

		await finalizeSession({
			deps: harness.deps,
			reason: "idle_timeout",
			session,
			status: "timed_out",
		});
		const terminal = await waitForTerminal(harness);

		expect(harness.putCalls).toHaveLength(3);
		expect(terminal.statusReason).toBe("idle_timeout,artifacts_upload_failed");
		expect(terminal.status).toBe("timed_out");
		expect(harness.insertedRows).toHaveLength(0);
	});
});

describe("recorder_detached 的记法", () => {
	it("没有别的死因时才写进去", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot();
		session.recorderDetached = true;

		await finalizeSession({ deps: harness.deps, session, status: "completed" });
		const terminal = await waitForTerminal(harness);

		expect(terminal.statusReason).toBe("recorder_detached");
	});

	it("已经有死因时不掺进去（按 reason 分组的统计不该被打散）", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);
		session.slot = makeSlot();
		session.recorderDetached = true;

		await finalizeSession({
			deps: harness.deps,
			reason: "killed_by_operator",
			session,
			status: "killed",
		});
		const terminal = await waitForTerminal(harness);

		expect(terminal.statusReason).toBe("killed_by_operator");
	});
});

describe("没有容器的会话（起容器之前就失败）", () => {
	it("照样走完收尾并落终态", async () => {
		const harness = makeHarness();
		const session = makeSession(harness.deps);

		await finalizeSession({
			deps: harness.deps,
			reason: "container_start_failed",
			session,
			status: "failed",
		});
		const terminal = await waitForTerminal(harness);

		expect(terminal).toMatchObject({
			status: "failed",
			statusReason: "container_start_failed",
		});
		expect(harness.statusWrites[0]?.input.containerId).toBeUndefined();
		expect(harness.insertedRows).toHaveLength(0);
	});
});
