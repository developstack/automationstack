import { describe, expect, test } from "vitest";

import {
	buildCaseAttachmentRef,
	CASE_ATTACHMENT_REF_PATTERN,
	CASE_ATTACHMENT_REF_SCHEME,
	extractCaseAttachmentIds,
	isCaseAttachmentRef,
} from "./case-attachment-ref";

const ID = "5f2c1a8e-1b4d-4c9a-8e2f-7a6b5c4d3e2f";

test("buildCaseAttachmentRef 产生约定格式，含 scheme 常量，且能被自己解析回来（往返）", () => {
	const ref = buildCaseAttachmentRef(ID);
	expect(ref).toBe(`![](attachment:${ID})`);
	expect(ref).toContain(CASE_ATTACHMENT_REF_SCHEME);
	expect(extractCaseAttachmentIds(ref)).toEqual([ID]);
});

describe("extractCaseAttachmentIds", () => {
	test("从混着普通文字的正文里按出现顺序取出全部 id", () => {
		const other = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
		const body = [
			"点击「上传」按钮",
			buildCaseAttachmentRef(ID),
			"确认弹窗如下",
			buildCaseAttachmentRef(other),
		].join("\n");
		expect(extractCaseAttachmentIds(body)).toEqual([ID, other]);
	});

	test("保留重复的引用：同一张图贴两次要渲染两次", () => {
		const body = `${buildCaseAttachmentRef(ID)}${buildCaseAttachmentRef(ID)}`;
		expect(extractCaseAttachmentIds(body)).toEqual([ID, ID]);
	});

	test.each([
		["纯文本正文取不出任何 id", "普通前置条件，没有图"],
		["不认 id 不是 uuid 的引用", "![](attachment:../../etc/passwd)"],
		[
			"不认带 alt 文字的写法：格式只有一种合法形态",
			`![截图](attachment:${ID})`,
		],
		[
			"不认存 storage key 而非 id 的写法",
			"![](attachment:test-cases/p/c/abc.png)",
		],
	])("%s", (_name, body) => {
		expect(extractCaseAttachmentIds(body)).toEqual([]);
	});

	test("连续调用两次结果相同（正则的 lastIndex 没被污染）", () => {
		const body = buildCaseAttachmentRef(ID);
		expect(extractCaseAttachmentIds(body)).toEqual(
			extractCaseAttachmentIds(body)
		);
		expect(CASE_ATTACHMENT_REF_PATTERN.lastIndex).toBe(0);
	});
});

describe("isCaseAttachmentRef", () => {
	test("整串恰好是一处引用时为真，连问两次答案一致", () => {
		const ref = buildCaseAttachmentRef(ID);
		expect(isCaseAttachmentRef(ref)).toBe(true);
		expect(isCaseAttachmentRef(ref)).toBe(true);
	});

	test("前后带别的字符时为假（它判的是「整串」，不是「包含」）", () => {
		expect(isCaseAttachmentRef(`看图：${buildCaseAttachmentRef(ID)}`)).toBe(
			false
		);
	});
});
