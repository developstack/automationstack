/**
 * pi 模型运行时的假实现：一份只有元数据的 `Model`、一个不出网的 `StreamFn`，
 * 外加构造 assistant 消息的小工具。
 *
 * 与 fake-ports.ts 分文件是同一个理由：`agent.test.ts` 要钉的是「注入了模型
 * 就完全不碰配置端口」，`agent-events.test.ts` 要钉的是「一条 message_end
 * 长什么样」，两边共用同一份假实现，对 pi 形状的理解才不会各写一份然后
 * 悄悄分叉。本文件只被测试引用。
 */
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type {
	AssistantMessage,
	Model,
	StopReason,
	Usage,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

const FAKE_PROVIDER = "fake-provider";
const FAKE_MODEL_ID = "fake-model";
const SMALL_CONTEXT_WINDOW = 1000;
const SMALL_MAX_TOKENS = 100;

const NO_USAGE: Usage = {
	cacheRead: 0,
	cacheWrite: 0,
	cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
	input: 0,
	output: 0,
	totalTokens: 0,
};

/**
 * `baseUrl` 指向一个必定连不上的地址：`streamFn` 被换掉之后它不该被用到，
 * 万一哪天真被用到了，测试要立刻失败而不是悄悄出网。
 */
export function createFakeModel(): Model<"openai-completions"> {
	return {
		api: "openai-completions",
		baseUrl: "http://127.0.0.1:1/v1",
		contextWindow: SMALL_CONTEXT_WINDOW,
		cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
		id: FAKE_MODEL_ID,
		input: ["text"],
		maxTokens: SMALL_MAX_TOKENS,
		name: FAKE_MODEL_ID,
		provider: FAKE_PROVIDER,
		reasoning: false,
	};
}

export function createFakeAssistantMessage(
	stopReason: StopReason,
	errorMessage?: string
): AssistantMessage {
	return {
		api: "openai-completions",
		content: [],
		errorMessage,
		model: FAKE_MODEL_ID,
		provider: FAKE_PROVIDER,
		role: "assistant",
		stopReason,
		timestamp: 0,
		usage: NO_USAGE,
	};
}

/**
 * 「一句话都没说就停了」的流函数：不出网，且因为 `done` 事件会把
 * `EventStream` 直接置为完成，流一定会结束，测试不会挂住。
 */
export function createFakeStreamFn(): StreamFn {
	return () => {
		const stream = createAssistantMessageEventStream();
		stream.push({
			message: createFakeAssistantMessage("stop"),
			reason: "stop",
			type: "done",
		});
		return stream;
	};
}
