/**
 * 流式思考文本的外部 store。
 *
 * `text-delta` 事件每个 token 一条，直接进 React state 会让整棵对话框树
 * 高频重渲。这里把文本累加放在闭包里并按固定间隔 flush，只有订阅了本
 * store 的文本组件（useSyncExternalStore）会重渲。
 */

const FLUSH_INTERVAL_MS = 80;

export interface AiTextStore {
	/** 追加一段增量文本（不会立即通知订阅者）。 */
	append: (text: string) => void;
	/** 已 flush 的完整文本；两次通知之间保持引用稳定。 */
	getSnapshot: () => string;
	/** 清空文本（开始新一轮生成时调用）。 */
	reset: () => void;
	subscribe: (listener: () => void) => () => void;
}

export function createAiTextStore(): AiTextStore {
	const listeners = new Set<() => void>();
	let flushed = "";
	let pending = "";
	let timer: ReturnType<typeof setTimeout> | null = null;

	function emit(): void {
		for (const listener of listeners) {
			listener();
		}
	}

	function flush(): void {
		timer = null;
		if (pending === "") {
			return;
		}
		flushed += pending;
		pending = "";
		emit();
	}

	return {
		append(text: string) {
			pending += text;
			if (timer === null) {
				timer = setTimeout(flush, FLUSH_INTERVAL_MS);
			}
		},
		getSnapshot: () => flushed,
		reset() {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			pending = "";
			flushed = "";
			emit();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
