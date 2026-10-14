import { describe, expect, it } from "vitest";

import {
	buildCaseUploadingRef,
	extractCaseUploadingToken,
	replaceCaseImageRef,
} from "@/components/cases/case-upload-placeholder";

const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const REF = buildCaseUploadingRef(TOKEN);

describe("占位引用", () => {
	it("build 与 extract 是一对", () => {
		expect(extractCaseUploadingToken(REF)).toBe(TOKEN);
	});

	it("token 不是 uuid、或前后还有别的字符，都不认", () => {
		expect(extractCaseUploadingToken("![](uploading:foo)")).toBeUndefined();
		expect(extractCaseUploadingToken(`x${REF}`)).toBeUndefined();
	});
});

describe("replaceCaseImageRef", () => {
	it.each([
		[
			"只换第一处，其余原样留着（每处占位各自有自己的 token）",
			[`a${REF}b${REF}`, REF, "X"],
			`aXb${REF}`,
		],
		["空替换串即删除", [`a${REF}b`, REF, ""], "ab"],
		["找不到就原样返回（用户可能已经把占位删了）", ["abc", "zzz", "X"], "abc"],
		["替换串里的 $& 不会被当成模式引用展开", ["a-b", "-", "$&"], "a$&b"],
	] as const)("%s", (_name, [text, ref, replacement], expected) => {
		expect(replaceCaseImageRef(text, ref, replacement)).toBe(expected);
	});
});
