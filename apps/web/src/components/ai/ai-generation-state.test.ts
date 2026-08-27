/**
 * 工具报错事件在面板上的落点。
 *
 * 后端的 `tool-error` 是**非终止**事件（AI SDK 把工具错误回灌给模型，下一步
 * 常常重试成功），所以 reducer 只能往活动日志里加一行警告：一旦有人图省事
 * 把它并进 `error` 分支，withError 会把 phase 推到 review、把 state.error 点亮，
 * 一次自愈的中间步骤看起来就成了整轮生成失败——而生成其实还在跑。
 */
import { describe, expect, it } from "vitest";

import {
	aiGenerationReducer,
	initialAiGenerationState,
} from "@/components/ai/ai-generation-state";

const streamingState = aiGenerationReducer(initialAiGenerationState, {
	type: "start",
});

describe("aiGenerationReducer 的 tool-error", () => {
	it("记进活动日志，带上原因", () => {
		const next = aiGenerationReducer(streamingState, {
			event: {
				message: "priority 只能是 P0~P3",
				toolName: "propose_cases",
				type: "tool-error",
			},
			type: "event",
		});

		expect(next.toolCalls).toEqual([
			{
				error: "priority 只能是 P0~P3",
				id: "0-propose_cases-error",
				toolName: "propose_cases",
			},
		]);
	});

	it("不点亮错误态、不提前结束流：生成还在跑", () => {
		const next = aiGenerationReducer(streamingState, {
			event: {
				message: "模块不存在",
				toolName: "read_existing_cases",
				type: "tool-error",
			},
			type: "event",
		});

		expect(next.error).toBeNull();
		expect(next.phase).toBe("streaming");
	});

	it("与成功调用共用一条日志，key 不撞", () => {
		const called = aiGenerationReducer(streamingState, {
			event: { toolName: "propose_cases", type: "tool-call" },
			type: "event",
		});
		const next = aiGenerationReducer(called, {
			event: {
				message: "入参校验失败",
				toolName: "propose_cases",
				type: "tool-error",
			},
			type: "event",
		});

		expect(next.toolCalls.map((call) => call.id)).toEqual([
			"0-propose_cases-call",
			"1-propose_cases-error",
		]);
		expect(next.toolCalls[0]?.error).toBeNull();
	});
});
