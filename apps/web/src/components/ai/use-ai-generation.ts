/**
 * 消费 `ai.generate` 的 oRPC event iterator。
 *
 * - 生成中再次发起会被并发守卫挡住（useAbortableRun 的 runningRef）；
 * - 停止 = AbortController.abort()，组件卸载时自动中止；
 * - text-delta 走 AiTextStore（节流），其余事件进 reducer；
 * - sessionId 落 sessionStorage，刷新后经 getSession 直接回到评审阶段。
 */
import type { AiGenerateEvent } from "@automationstack/api/lib/ai-generation-stream";
import type { AiProposalStatus } from "@automationstack/db/schema/ai";
import { ORPCError } from "@orpc/client";
import { type Dispatch, useCallback, useReducer, useState } from "react";

import {
	type AiGenerationAction,
	type AiGenerationState,
	aiGenerationReducer,
	initialAiGenerationState,
} from "@/components/ai/ai-generation-state";
import {
	clearStoredSessionId,
	writeStoredSessionId,
} from "@/components/ai/ai-session-storage";
import {
	type AiTextStore,
	createAiTextStore,
} from "@/components/ai/ai-text-store";
import { useAbortableRun } from "@/components/ai/use-abortable-run";
import { useAiSessionRestore } from "@/components/ai/use-ai-session-restore";
import { client } from "@/utils/orpc";

export interface AiGenerateValues {
	moduleId: string | undefined;
	requirement: string;
}

interface GenerateInput extends AiGenerateValues {
	projectId: string;
}

/**
 * AI 未配置时 `ai.generate` 会立刻抛 SERVICE_UNAVAILABLE（oRPC 定义错误）。
 * ORPCError 自带 Symbol.hasInstance，跨依赖图的 instanceof 也成立。
 */
function isUnavailableError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "SERVICE_UNAVAILABLE";
}

function toFailureAction(error: unknown): AiGenerationAction {
	return {
		message: error instanceof Error ? error.message : String(error),
		type: "failure",
		unavailable: isUnavailableError(error),
	};
}

async function consumeGeneration(
	input: GenerateInput,
	signal: AbortSignal,
	onEvent: (event: AiGenerateEvent) => void
): Promise<void> {
	const iterator = await client.ai.generate(input, { signal });
	for await (const event of iterator) {
		onEvent(event);
	}
}

/**
 * 事件分流：token 增量进 store（节流重渲），其余进 reducer；
 * 首个 session 事件顺带把 sessionId 存下来，供刷新恢复。
 */
function useEventSink(
	projectId: string,
	textStore: AiTextStore,
	dispatch: Dispatch<AiGenerationAction>
) {
	return useCallback(
		(event: AiGenerateEvent) => {
			if (event.type === "text-delta") {
				textStore.append(event.text);
				return;
			}
			if (event.type === "session") {
				writeStoredSessionId(projectId, event.sessionId);
			}
			dispatch({ event, type: "event" });
		},
		[dispatch, projectId, textStore]
	);
}

export interface AiGeneration extends AiGenerationState {
	isRunning: boolean;
	markProposals: (ids: string[], status: AiProposalStatus) => void;
	reset: () => void;
	restore: () => void;
	start: (values: AiGenerateValues) => void;
	stop: () => void;
	textStore: AiTextStore;
}

export function useAiGeneration(projectId: string): AiGeneration {
	const [state, dispatch] = useReducer(
		aiGenerationReducer,
		initialAiGenerationState
	);
	const [textStore] = useState(createAiTextStore);
	const runner = useAbortableRun();
	const onEvent = useEventSink(projectId, textStore, dispatch);
	const restore = useAiSessionRestore(projectId, dispatch);

	const start = useCallback(
		(values: AiGenerateValues) => {
			const input = { ...values, projectId };
			textStore.reset();
			clearStoredSessionId(projectId);
			dispatch({ type: "start" });
			runner.run({
				onError: (error) => dispatch(toFailureAction(error)),
				onSettled: () => dispatch({ type: "finish" }),
				task: (signal) => consumeGeneration(input, signal, onEvent),
			});
		},
		[onEvent, projectId, runner, textStore]
	);

	const reset = useCallback(() => {
		runner.stop();
		clearStoredSessionId(projectId);
		textStore.reset();
		dispatch({ type: "reset" });
	}, [projectId, runner, textStore]);

	const markProposals = useCallback(
		(ids: string[], status: AiProposalStatus) =>
			dispatch({ ids, status, type: "mark" }),
		[]
	);

	return {
		...state,
		isRunning: runner.isRunning,
		markProposals,
		reset,
		restore,
		start,
		stop: runner.stop,
		textStore,
	};
}
