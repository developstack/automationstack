import { createWriteStream, type WriteStream } from "node:fs";
import { join } from "node:path";
import type { RecorderEvent } from "./normalize";
import { RECORDER_EVENT_TYPE } from "./normalize";
import { CONSOLE_FILE_NAME, EVENTS_FILE_NAME } from "./paths";

/**
 * 事件落盘（plan §5.5「落盘与产物」）。
 *
 * 两条流：
 * - `events.ndjson`：全量事件，finalize 时喂给 har.ts；本身不作为产物；
 * - `console.ndjson`：console 三类事件的副本。为什么写两份而不是 finalize 时
 *   从 events 里过滤——console 产物要的就是「一行一条、直接能看」，录制期顺手
 *   多写一行的成本远低于 finalize 再扫一遍全量文件，且会话被强杀时这份也是完整的。
 *
 * 一切写盘错误都吞掉：观测挂了不许影响会话执行（plan §5.5「故障语义」）。
 */

const CONSOLE_EVENT_TYPES: ReadonlySet<string> = new Set([
	RECORDER_EVENT_TYPE.consoleApiCalled,
	RECORDER_EVENT_TYPE.exceptionThrown,
	RECORDER_EVENT_TYPE.logEntryAdded,
]);

export interface RecorderSink {
	/** flush 并关闭两条流，幂等。 */
	close: () => Promise<void>;
	/** 同步入队，不返回 Promise：事件回调在 ws 的 message 里，不能被磁盘拖住。 */
	write: (event: RecorderEvent) => void;
}

const ignoreStreamError = (): void => {
	/* 磁盘写失败（满了、目录被删）不得炸掉会话，这里刻意吞掉 */
};

const openAppendStream = (filePath: string): WriteStream => {
	// flags "a"：录制期可能重连，重连后要接着写同一份文件而不是截断重来。
	const stream = createWriteStream(filePath, { flags: "a" });
	stream.on("error", ignoreStreamError);
	return stream;
};

const closeStream = (stream: WriteStream): Promise<void> =>
	new Promise((resolve) => {
		// 'error' 也 resolve：close() 是收尾路径，这里再抛只会把 finalize 带崩。
		stream.once("error", () => resolve());
		stream.end(() => resolve());
	});

export const createRecorderSink = (workDir: string): RecorderSink => {
	const eventsStream = openAppendStream(join(workDir, EVENTS_FILE_NAME));
	// console 流懒开：一个会话可能一条 console 都没有，那就不该留下空文件
	// （collect 以「文件存在」判断要不要报这个产物）。
	let consoleStream: WriteStream | null = null;
	let closed = false;

	return {
		async close() {
			if (closed) {
				return;
			}
			closed = true;
			await closeStream(eventsStream);
			if (consoleStream) {
				await closeStream(consoleStream);
			}
		},
		write(event) {
			if (closed) {
				return;
			}
			let line: string;
			try {
				line = `${JSON.stringify(event)}\n`;
			} catch {
				// 理论上不该发生（事件都是从 JSON 解析来的），但归一化层将来
				// 若不小心塞进循环引用，也只该丢这一条，不该炸整个会话。
				return;
			}
			eventsStream.write(line);
			if (!CONSOLE_EVENT_TYPES.has(event.type)) {
				return;
			}
			if (!consoleStream) {
				consoleStream = openAppendStream(join(workDir, CONSOLE_FILE_NAME));
			}
			consoleStream.write(line);
		},
	};
};
