import { describe, expect, it } from "vitest";

import {
	buildCaseUploadingRef,
	extractCaseUploadingToken,
	replaceCaseImageRef,
} from "@/components/cases/case-upload-placeholder";

const TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("占位引用", () => {
	it("build 与 extract 是一对", () => {
		expect(extractCaseUploadingToken(buildCaseUploadingRef(TOKEN))).toBe(TOKEN);
	});

	it("token 不是 uuid、或前后还有别的字符，都不认", () => {
		expect(extractCaseUploadingToken("![](uploading:foo)")).toBeUndefined();
		expect(
			extractCaseUploadingToken(`x${buildCaseUploadingRef(TOKEN)}`)
		).toBeUndefined();
	});
});

describe("replaceCaseImageRef", () => {
	it("只换第一处，其余原样留着（每处占位各自有自己的 token）", () => {
		const ref = buildCaseUploadingRef(TOKEN);
		expect(replaceCaseImageRef(`a${ref}b${ref}`, ref, "X")).toBe(`aXb${ref}`);
	});

	it("空替换串即删除", () => {
		const ref = buildCaseUploadingRef(TOKEN);
		expect(replaceCaseImageRef(`a${ref}b`, ref, "")).toBe("ab");
	});

	it("找不到就原样返回（用户可能已经把占位删了）", () => {
		expect(replaceCaseImageRef("abc", "zzz", "X")).toBe("abc");
	});

	it("替换串里的 $& 不会被当成模式引用展开", () => {
		// 刻意不用 String.replace 就是为了这一条：$& 在 replace 里会展开成
		// 被匹配的整段，正文里就会凭空多出一串占位。
		expect(replaceCaseImageRef("a-b", "-", "$&")).toBe("a$&b");
	});
});
