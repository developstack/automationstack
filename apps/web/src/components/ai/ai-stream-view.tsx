/**
 * 流式进度渲染：状态行 + 工具调用徽章 + 思考文本。
 *
 * 文本走 useSyncExternalStore 订阅 AiTextStore，token 增量只重渲
 * <AiStreamText />，不会带动整个对话框。
 */
import { Badge } from "@automationstack/ui/components/badge";
import { Bubble, BubbleContent } from "@automationstack/ui/components/bubble";
import {
	Message,
	MessageContent,
	MessageGroup,
} from "@automationstack/ui/components/message";
import { cn } from "@automationstack/ui/lib/utils";
import { Loader2Icon, WrenchIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { AiToolCall } from "@/components/ai/ai-generation-state";
import type { AiTextStore } from "@/components/ai/ai-text-store";

/** 后端工具名 → 面板上的中文说明。 */
const TOOL_LABELS: Record<string, string> = {
	list_modules: "浏览模块结构",
	propose_cases: "提交用例提案",
	read_existing_cases: "阅读已有用例",
};

function toolLabel(toolName: string): string {
	return TOOL_LABELS[toolName] ?? toolName;
}

function AiStreamText({ store }: { store: AiTextStore }) {
	const text = useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot
	);

	if (text === "") {
		return null;
	}

	return (
		<Message>
			<MessageContent>
				<Bubble variant="muted">
					<BubbleContent className="whitespace-pre-wrap">{text}</BubbleContent>
				</Bubble>
			</MessageContent>
		</Message>
	);
}

function AiToolCalls({ toolCalls }: { toolCalls: AiToolCall[] }) {
	if (toolCalls.length === 0) {
		return null;
	}
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{toolCalls.map((call) => (
				<Badge key={call.id} variant="secondary">
					<WrenchIcon data-icon="inline-start" />
					{toolLabel(call.toolName)}
				</Badge>
			))}
		</div>
	);
}

export interface AiStreamViewProps {
	error: string | null;
	isRunning: boolean;
	status: string | null;
	textStore: AiTextStore;
	toolCalls: AiToolCall[];
}

export function AiStreamView(props: AiStreamViewProps) {
	const statusText =
		props.status ?? (props.isRunning ? "正在生成…" : "本轮生成已结束");

	return (
		<div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">
			<div
				aria-live="polite"
				className="flex items-center gap-2 text-muted-foreground text-xs"
			>
				{/*
				 * 转圈图标常驻 DOM，只切 animate-spin / invisible：卸载它会让状态文字
				 * 在「生成结束」那一刻左移 22px（图标 14 + gap-2 的 8），本来只是换了句
				 * 文案，看上去像整行抖了一下。invisible 保留占位盒，不会被读屏读到。
				 */}
				<Loader2Icon
					aria-hidden={true}
					className={cn(
						"size-3.5 shrink-0",
						props.isRunning ? "animate-spin" : "invisible"
					)}
				/>
				<span>{statusText}</span>
			</div>
			<AiToolCalls toolCalls={props.toolCalls} />
			<MessageGroup>
				<AiStreamText store={props.textStore} />
			</MessageGroup>
			{props.error === null ? null : (
				<p className="text-destructive text-xs">{props.error}</p>
			)}
		</div>
	);
}
