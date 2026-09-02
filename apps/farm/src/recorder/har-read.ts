/**
 * 从「过了一趟磁盘」的宽类型数据里安全取值的一组小读取器。
 *
 * 从 `har.ts` 拆出来：那份文件到了 670 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为这些函数是
 * `har.ts` 容错策略的地基——NDJSON 读回来什么都可能，每一次取值都得先问类型，
 * 拆出来的每个组装模块都会用到它们，所以与结构类型一样放在依赖图底层。
 */

import type { HarNameValue, HarTimings } from "./har-types";
import { UNKNOWN } from "./har-types";

const DECIMALS = 1000;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const readString = (
	source: Record<string, unknown>,
	key: string
): string | undefined => {
	const value = source[key];
	return typeof value === "string" ? value : undefined;
};

export const readNumber = (
	source: Record<string, unknown>,
	key: string
): number | undefined => {
	const value = source[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
};

export const readRecord = (
	source: Record<string, unknown>,
	key: string
): Record<string, unknown> | undefined => {
	const value = source[key];
	return isRecord(value) ? value : undefined;
};

export const readHeaders = (
	source: Record<string, unknown>,
	key: string
): HarNameValue[] => {
	const headers = readRecord(source, key);
	if (!headers) {
		return [];
	}
	return Object.entries(headers).map(([name, value]) => ({
		name,
		value: typeof value === "string" ? value : String(value),
	}));
};

export const findHeader = (
	headers: HarNameValue[],
	name: string
): string | undefined =>
	headers.find((header) => header.name.toLowerCase() === name)?.value;

export const round = (value: number): number =>
	Math.round(value * DECIMALS) / DECIMALS;

/** 非法/越界的毫秒数一律回落到 epoch 0，而不是让 toISOString 抛 RangeError。 */
export const toIsoString = (epochMs: number): string => {
	try {
		return new Date(epochMs).toISOString();
	} catch {
		return new Date(0).toISOString();
	}
};

export const emptyTimings = (): HarTimings => ({
	blocked: UNKNOWN,
	connect: UNKNOWN,
	dns: UNKNOWN,
	receive: UNKNOWN,
	send: UNKNOWN,
	ssl: UNKNOWN,
	wait: UNKNOWN,
});
