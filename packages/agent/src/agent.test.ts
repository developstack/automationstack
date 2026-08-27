/**
 * agent 与 `ProviderConfigStore` 端口之间的契约。
 *
 * 重点是「没配 provider」这条路径：它必须以一条 **error 事件**收场而不是抛给
 * 调用方——宿主的 `resolveFinalState` 只认终止性事件来落会话终态，抛出去
 * 会让会话永远停在 running。文案由本包的 `PROVIDER_UNCONFIGURED_MESSAGE`
 * 统一提供，路由层的预检用的也是同一句。
 */
import { describe, expect, it } from "vitest";

import { runGenerationAgent } from "./agent";
import type { GenerationEvent } from "./agent-events";
import { createFakeModel, createFakeStreamFn } from "./fake-model";
import { createFakePorts } from "./fake-ports";
import { PROVIDER_UNCONFIGURED_MESSAGE } from "./provider";

const RUN_INPUT = {
	projectId: "project-1",
	requirement: "登录功能",
	sessionId: "session-1",
};

function collect(
	ports: ReturnType<typeof createFakePorts>
): Promise<GenerationEvent[]> {
	return Array.fromAsync(runGenerationAgent({ ...RUN_INPUT, ports }));
}

describe("runGenerationAgent 的 provider 配置分支", () => {
	it("配置缺失（端口返回 null）时以 error 事件收场，不抛给调用方", async () => {
		const ports = createFakePorts({ providerConfig: null });

		const events = await collect(ports);

		expect(events).toEqual([
			{ message: "生成任务已启动", type: "status" },
			{ aborted: false, message: PROVIDER_UNCONFIGURED_MESSAGE, type: "error" },
		]);
	});

	it("配置缺失时一条提案都不落盘，也不去读项目资料", async () => {
		const ports = createFakePorts({ providerConfig: null });

		await collect(ports);

		expect(ports.sessionStore.saved.size).toBe(0);
		expect(ports.caseCatalog.outlineCalls).toEqual([]);
	});

	it("端口读取本身抛错时同样翻成 error 事件（宿主的库/网络故障不该穿透）", async () => {
		const ports = createFakePorts({ providerConfig: null });
		ports.providerConfig.read = () =>
			Promise.reject(new Error("配置存储不可用"));

		const events = await collect(ports);

		expect(events.at(-1)).toEqual({
			aborted: false,
			message: "配置存储不可用",
			type: "error",
		});
	});

	it("注入了 model 的调用方完全不碰配置端口（`??` 必须短路）", async () => {
		const ports = createFakePorts({ providerConfig: null });

		// pi 把 AI SDK 的 `LanguageModel` 拆成了「元数据」与「怎么发请求」两半，
		// 所以这里注入的是一对假实现：模型只是元数据，流函数一句话不说就停。
		// 本例断言的是「读了几次配置」，流本身怎么收场无关紧要（假流函数也
		// 顺带保证测试绝不出网）。若 `??` 没短路，read 会被调用一次。
		const model = {
			model: createFakeModel(),
			streamFn: createFakeStreamFn(),
		};

		await Array.fromAsync(runGenerationAgent({ ...RUN_INPUT, model, ports }));

		expect(ports.providerConfig.readCount()).toBe(0);
	});
});
