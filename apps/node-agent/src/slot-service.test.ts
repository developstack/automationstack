import type {
	AcquiredSlot,
	SlotProvider,
} from "@automationstack/browser-slots";
import { describe, expect, it } from "vitest";

import { createSlotService, type SlotService } from "./slot-service";
import {
	createFakeProvider,
	fakeCapabilities,
	silentLogger,
} from "./test-harness";

/** 断言用的正则一律提到顶层（规则要求，也免得每个用例重编译一次）。 */
const SLOTS_FULL_1_OF_1 = /节点槽位已满（1\/1）/;
const SLOTS_FULL = /节点槽位已满/;
const UNKNOWN_HANDLE = /不在本节点的句柄表里/;
const BAD_PARAMS = /acquire 的参数不合协议：/;
const BAD_DETECT_PARAMS = /detectCapabilities 的参数不合协议：/;
const NO_IMAGE_ON_DOCKER = /没有为 s-1 下发镜像/;

const FUTURE_EPOCH_SEC = Math.floor(Date.now() / 1000) + 600;

/** 故意用一个**不符合任何命名约定**的 tag：能透传才说明节点没在自己拼镜像名。 */
const IMAGE = "registry.example.com/qa/chromium-fork:2026-08";

function acquireParams(sessionId: string) {
	return {
		browserName: "chromium",
		browserVersion: null,
		expiresAtEpochSec: FUTURE_EPOCH_SEC,
		// 镜像由 farm 下发（真相源是库里的 farm_browsers.image），节点不拼也不猜。
		image: IMAGE,
		mode: "cdp",
		sessionId,
	};
}

function serviceWith(
	maxSlots: number,
	backend: "docker" | "local" = "local"
): {
	fake: ReturnType<typeof createFakeProvider>;
	service: SlotService;
} {
	const fake = createFakeProvider({ cdpPort: 32_768 });
	return {
		fake,
		service: createSlotService({
			backend,
			detectCapabilities: () => Promise.resolve(fakeCapabilities()),
			logger: silentLogger,
			maxSlots,
			provider: fake.provider,
		}),
	};
}

describe("createSlotService", () => {
	it("acquire 把槽位端点翻成端口回给 farm", async () => {
		const { fake, service } = serviceWith(2);
		const result = await service.handleCall("acquire", acquireParams("s-1"));
		expect(result).toEqual({
			browserArgs: ["--headless=new"],
			cdpDebugPort: 32_768,
			cdpPort: 32_768,
			containerId: "local-s-1",
			wdPort: null,
		});
		expect(fake.acquired[0]?.image).toBe(IMAGE);
		expect(service.activeCount()).toBe(1);
	});

	it("满载时自守：farm 也会调度，但节点这一道是两级强制的另一半", async () => {
		const { service } = serviceWith(1);
		await service.handleCall("acquire", acquireParams("s-1"));
		await expect(
			service.handleCall("acquire", acquireParams("s-2"))
		).rejects.toThrow(SLOTS_FULL_1_OF_1);
	});

	it("在途的 acquire 也算进分母，两条并发 call 不会一起过闸", async () => {
		// 初值给一个空函数而不是 null：`let x: F | null = null` 在回调里赋的值
		// TS 的控制流分析看不见，调用点会被收窄成 never。
		let release: () => void = () => undefined;
		const provider: SlotProvider = {
			acquire: (input) =>
				new Promise<AcquiredSlot>((resolve) => {
					release = () =>
						resolve({
							browserArgs: [],
							cdpDebugPort: 1234,
							cdpHttpEndpoint: "http://127.0.0.1:1234",
							containerId: `local-${input.sessionId}`,
							readLogs: () => Promise.resolve(""),
							release: () => Promise.resolve(),
							wdEndpoint: null,
						});
				}),
			listManagedContainers: () => Promise.resolve([]),
			releaseContainer: () => Promise.resolve(),
		};
		const service = createSlotService({
			backend: "local",
			detectCapabilities: () => Promise.resolve(fakeCapabilities()),
			logger: silentLogger,
			maxSlots: 1,
			provider,
		});
		const first = service.handleCall("acquire", acquireParams("s-1"));
		const second = service.handleCall("acquire", acquireParams("s-2"));
		await expect(second).rejects.toThrow(SLOTS_FULL);
		release();
		await expect(first).resolves.toBeDefined();
	});

	it("detectCapabilities 现探现报，出参过一遍协议", async () => {
		const { service } = serviceWith(1);
		// 空入参也要合协议：这个方法唯一的入参形态就是 `{}`。
		await expect(service.handleCall("detectCapabilities", {})).resolves.toEqual(
			fakeCapabilities()
		);
		// 多余的键按 zod 默认剥掉即可（listManaged 同一条），但连对象都不是的入参
		// 必须当场拦下：那说明对端根本不是我们认识的那个协议版本。
		await expect(
			service.handleCall("detectCapabilities", null)
		).rejects.toThrow(BAD_DETECT_PARAMS);
	});

	it("release 查不到句柄按幂等处理（reaper 与正常收尾会撞车）", async () => {
		const { service } = serviceWith(1);
		await expect(
			service.handleCall("release", { containerId: "local-不存在" })
		).resolves.toBeNull();
	});

	it("release 之后腾出名额，可以再起一条", async () => {
		const { fake, service } = serviceWith(1);
		await service.handleCall("acquire", acquireParams("s-1"));
		await service.handleCall("release", { containerId: "local-s-1" });
		expect(fake.released).toEqual(["local-s-1"]);
		expect(service.activeCount()).toBe(0);
		await expect(
			service.handleCall("acquire", acquireParams("s-2"))
		).resolves.toBeDefined();
	});

	it("readLogs 只能走句柄，查不到时必须报错而不是回一段空日志", async () => {
		const { service } = serviceWith(1);
		await service.handleCall("acquire", acquireParams("s-1"));
		await expect(
			service.handleCall("readLogs", { containerId: "local-s-1" })
		).resolves.toEqual({ logs: "chrome 起来了\n" });
		await expect(
			service.handleCall("readLogs", { containerId: "local-别人的" })
		).rejects.toThrow(UNKNOWN_HANDLE);
	});

	it("releaseContainer 走 provider，并把句柄一起摘掉", async () => {
		const { fake, service } = serviceWith(1);
		await service.handleCall("acquire", acquireParams("s-1"));
		await service.handleCall("releaseContainer", {
			containerId: "local-s-1",
		});
		expect(fake.released).toEqual(["local-s-1"]);
		expect(service.activeCount()).toBe(0);
	});

	it("local 后端收 image: null 照跑：它的浏览器来自本机探测，本就没有镜像", async () => {
		const { fake, service } = serviceWith(1);
		await expect(
			service.handleCall("acquire", { ...acquireParams("s-1"), image: null })
		).resolves.toBeDefined();
		// 透传给 provider 的是占位串而不是空串——LocalProvider 忽略这个字段。
		expect(fake.acquired[0]?.image).not.toBe("");
	});

	it("docker 后端收 image: null 当场说人话，而不是把空串丢给 dockerode", async () => {
		const { service } = serviceWith(1, "docker");
		await expect(
			service.handleCall("acquire", { ...acquireParams("s-1"), image: null })
		).rejects.toThrow(NO_IMAGE_ON_DOCKER);
	});

	it("入参不合协议时报一句人能读的话，而不是 zod 的 JSON", async () => {
		const { service } = serviceWith(1);
		await expect(
			service.handleCall("acquire", { browserName: "chromium" })
		).rejects.toThrow(BAD_PARAMS);
	});

	it("releaseAll 清空整张表，断线与关停共用它", async () => {
		const { fake, service } = serviceWith(2);
		await service.handleCall("acquire", acquireParams("s-1"));
		await service.handleCall("acquire", acquireParams("s-2"));
		await service.releaseAll("测试");
		expect(fake.released).toEqual(["local-s-1", "local-s-2"]);
		expect(service.activeCount()).toBe(0);
	});
});
