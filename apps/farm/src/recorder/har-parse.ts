/**
 * events.ndjson 的逐行解析：文本 → `ParsedRecorderEvent[]`。
 *
 * 从 `har.ts` 拆出来：那份文件到了 670 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这一步是整条链路
 * 的入口、也是唯一直接面对「磁盘上那份文本」的地方：坏行的容错全收在这一个
 * 函数里，下游模块拿到的就都是形状确定的信封了。
 */

import { isRecord, readNumber, readRecord, readString } from "./har-read";
import type { ParsedRecorderEvent } from "./har-types";

export const parseRecorderEvents = (ndjson: string): ParsedRecorderEvent[] => {
	const events: ParsedRecorderEvent[] = [];
	let index = 0;

	for (const rawLine of ndjson.split("\n")) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			// 坏行：进程被杀时最后一行可能只写了一半。跳过，别丢整份记录。
			continue;
		}
		if (!isRecord(value)) {
			continue;
		}
		const type = readString(value, "type");
		const data = readRecord(value, "data");
		if (!(type && data)) {
			continue;
		}
		events.push({
			data,
			index,
			targetId: readString(value, "targetId") ?? "",
			ts: readNumber(value, "ts") ?? 0,
			type,
		});
		index += 1;
	}

	return events;
};
