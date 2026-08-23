/**
 * AI 生成面板的状态、事件 reducer 与动作。
 *
 * 事件联合体由后端 `AiGenerateEvent` 给出：session 必为首个事件，
 * proposal 按 id upsert（提案已落库，重放/恢复不会重复），
 * text-delta 不走这里（见 ai-text-store.ts）。
 */
import type { AiGenerateEvent } from "@automationstack/api/lib/ai-generation-stream";
import type {
	AiProposalStatus,
	ProposedCase,
} from "@automationstack/db/schema/ai";

/** 评审列表的一行：流式事件与 `getSession` 恢复共用同一形状。 */
export interface AiProposalEntry {
	acceptedCaseId: string | null;
	id: string;
	proposal: ProposedCase;
	status: AiProposalStatus;
}

export interface AiToolCall {
	id: string;
	toolName: string;
}

export type AiPhase = "input" | "streaming" | "review";

export interface AiGenerationState {
	error: string | null;
	phase: AiPhase;
	proposals: AiProposalEntry[];
	sessionId: string | null;
	/** 恢复会话时带回的目标模块，供评审阶段回填。 */
	sessionModuleId: string | null;
	status: string | null;
	toolCalls: AiToolCall[];
	/** AI 未配置（SERVICE_UNAVAILABLE）：给引导文案而不是报错 toast。 */
	unavailable: boolean;
}

export type AiGenerationAction =
	| { type: "event"; event: AiGenerateEvent }
	| { type: "failure"; message: string; unavailable: boolean }
	| { type: "finish" }
	| { type: "mark"; ids: string[]; status: AiProposalStatus }
	| { type: "reset" }
	| { type: "restore"; state: AiGenerationState }
	| { type: "start" };

export const initialAiGenerationState: AiGenerationState = {
	error: null,
	phase: "input",
	proposals: [],
	sessionId: null,
	sessionModuleId: null,
	status: null,
	toolCalls: [],
	unavailable: false,
};

function upsertProposal(
	list: AiProposalEntry[],
	entry: AiProposalEntry
): AiProposalEntry[] {
	if (list.some((item) => item.id === entry.id)) {
		return list.map((item) => (item.id === entry.id ? entry : item));
	}
	return [...list, entry];
}

function withToolCall(
	state: AiGenerationState,
	toolName: string
): AiGenerationState {
	const id = `${state.toolCalls.length}-${toolName}`;
	return { ...state, toolCalls: [...state.toolCalls, { id, toolName }] };
}

/** 生成失败时，若已经收到提案就直接进评审阶段，别把已有成果藏起来。 */
function withError(state: AiGenerationState, message: string) {
	return {
		...state,
		error: message,
		phase: state.proposals.length > 0 ? ("review" as const) : state.phase,
	};
}

function applyAiEvent(
	state: AiGenerationState,
	event: AiGenerateEvent
): AiGenerationState {
	switch (event.type) {
		case "session":
			return { ...state, sessionId: event.sessionId };
		case "status":
			return { ...state, status: event.message };
		case "tool-call":
			return withToolCall(state, event.toolName);
		case "proposal":
			return {
				...state,
				proposals: upsertProposal(state.proposals, {
					acceptedCaseId: null,
					id: event.id,
					proposal: event.proposal,
					status: "proposed",
				}),
			};
		case "done":
			return { ...state, phase: "review", status: null };
		case "error":
			return withError(state, event.aborted ? "生成已停止" : event.message);
		default:
			return state;
	}
}

function applyFailure(
	state: AiGenerationState,
	action: { message: string; unavailable: boolean }
): AiGenerationState {
	if (action.unavailable) {
		return { ...state, phase: "input", unavailable: true };
	}
	return withError(state, action.message);
}

/** 流结束（正常/中止/异常）后收尾：已有提案就进评审阶段。 */
function applyFinish(state: AiGenerationState): AiGenerationState {
	return state.phase === "streaming" && state.proposals.length > 0
		? { ...state, phase: "review" }
		: state;
}

export function aiGenerationReducer(
	state: AiGenerationState,
	action: AiGenerationAction
): AiGenerationState {
	switch (action.type) {
		case "event":
			return applyAiEvent(state, action.event);
		case "failure":
			return applyFailure(state, action);
		case "finish":
			return applyFinish(state);
		case "mark":
			return {
				...state,
				proposals: state.proposals.map((item) =>
					action.ids.includes(item.id)
						? { ...item, status: action.status }
						: item
				),
			};
		case "reset":
			return initialAiGenerationState;
		case "restore":
			return action.state;
		case "start":
			return { ...initialAiGenerationState, phase: "streaming" };
		default:
			return state;
	}
}
