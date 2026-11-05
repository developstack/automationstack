import { describe, expect, it } from "vitest";

import { parseByteRange } from "./byte-range";

describe("parseByteRange", () => {
	it.each([
		[undefined, 10, { kind: "whole" }],
		["bytes=0-0", 10, { end: 0, kind: "range", start: 0 }],
		["bytes=3-99", 10, { end: 9, kind: "range", start: 3 }],
		["bytes=-20", 10, { end: 9, kind: "range", start: 0 }],
		["bytes=10-", 10, { kind: "unsatisfiable" }],
		["bytes=5-2", 10, { kind: "unsatisfiable" }],
		["bytes=-0", 10, { kind: "unsatisfiable" }],
		["bytes=0-1,4-5", 10, { kind: "whole" }],
		["items=0-1", 10, { kind: "whole" }],
		["bytes=-", 10, { kind: "whole" }],
	])("%s of %i bytes", (header, size, expected) => {
		expect(parseByteRange(header, size)).toEqual(expected);
	});
});
