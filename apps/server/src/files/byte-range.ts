export type ByteRange =
	| { end: number; kind: "range"; start: number }
	| { kind: "unsatisfiable" }
	| { kind: "whole" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

const WHOLE: ByteRange = { kind: "whole" };
const UNSATISFIABLE: ByteRange = { kind: "unsatisfiable" };

/** bytes=-N：最后 N 个字节。 */
function suffixRange(suffix: number, size: number): ByteRange {
	if (suffix === 0 || size === 0) {
		return UNSATISFIABLE;
	}
	return { end: size - 1, kind: "range", start: Math.max(0, size - suffix) };
}

/** bytes=A-B 或 bytes=A-：B 超过文件末尾时取文件末尾。 */
function boundedRange(start: number, rawEnd: string, size: number): ByteRange {
	const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
	if (start >= size || start > end) {
		return UNSATISFIABLE;
	}
	return { end, kind: "range", start };
}

/**
 * 解析 Range 请求头。只支持一个范围：浏览器播放视频时只发这种请求。
 * 有多个范围或格式不对时，返回整个文件（RFC 9110 允许忽略 Range）。
 */
export function parseByteRange(
	header: string | undefined,
	size: number
): ByteRange {
	const match = header === undefined ? null : SINGLE_RANGE.exec(header.trim());
	const [, rawStart = "", rawEnd = ""] = match ?? [];
	if (rawStart === "" && rawEnd === "") {
		return WHOLE;
	}
	if (rawStart === "") {
		return suffixRange(Number(rawEnd), size);
	}
	return boundedRange(Number(rawStart), rawEnd, size);
}
