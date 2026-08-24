import { describe, expect, test } from "vitest";

import {
	buildCaseAttachmentRef,
	CASE_ATTACHMENT_REF_PATTERN,
	CASE_ATTACHMENT_REF_SCHEME,
	extractCaseAttachmentIds,
	isCaseAttachmentRef,
} from "./case-attachment-ref";

/**
 * 这个格式会被写进用例正文，而正文会被冻进**每一个**版本快照。
 * 也就是说：格式一旦改坏，坏掉的不只是当前正文，是全部历史。
 * 所以这里钉死的是「产生」与「解析」必须互为逆运算，以及边界上的不匹配。
 */

const ID = "5f2c1a8e-1b4d-4c9a-8e2f-7a6b5c4d3e2f";

describe("buildCaseAttachmentRef", () => {
	test("产生的正是约定格式", () => {
		expect(buildCaseAttachmentRef(ID)).toBe(`![](attachment:${ID})`);
	});

	test("产生的结果能被自己解析回来（往返）", () => {
		expect(extractCaseAttachmentIds(buildCaseAttachmentRef(ID))).toEqual([ID]);
	});

	test("scheme 常量与实际产生的字符串一致", () => {
		expect(buildCaseAttachmentRef(ID)).toContain(CASE_ATTACHMENT_REF_SCHEME);
	});
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

	test("纯文本正文取不出任何 id", () => {
		expect(extractCaseAttachmentIds("普通前置条件，没有图")).toEqual([]);
	});

	test("不认 id 不是 uuid 的引用", () => {
		expect(
			extractCaseAttachmentIds("![](attachment:../../etc/passwd)")
		).toEqual([]);
	});

	test("不认带 alt 文字的写法：格式只有一种合法形态", () => {
		expect(extractCaseAttachmentIds(`![截图](attachment:${ID})`)).toEqual([]);
	});

	test("不认存 storage key 而非 id 的写法", () => {
		const key = "test-cases/p/c/abc.png";

		expect(extractCaseAttachmentIds(`![](attachment:${key})`)).toEqual([]);
	});

	/**
	 * `CASE_ATTACHMENT_REF_PATTERN` 带 `g` 标志，是有状态的。`matchAll` 内部会
	 * 克隆正则，所以不会推进这个模块级字面量的 `lastIndex`——一旦有人把实现
	 * 换成 `exec` 循环，第二次调用就会从上次的位置开始，这条会红。
	 */
	test("连续调用两次结果相同（正则的 lastIndex 没被污染）", () => {
		const body = buildCaseAttachmentRef(ID);

		expect(extractCaseAttachmentIds(body)).toEqual(
			extractCaseAttachmentIds(body)
		);
		expect(CASE_ATTACHMENT_REF_PATTERN.lastIndex).toBe(0);
	});
});

describe("isCaseAttachmentRef", () => {
	test("整串恰好是一处引用时为真", () => {
		expect(isCaseAttachmentRef(buildCaseAttachmentRef(ID))).toBe(true);
	});

	test("前后带别的字符时为假（它判的是「整串」，不是「包含」）", () => {
		expect(isCaseAttachmentRef(`看图：${buildCaseAttachmentRef(ID)}`)).toBe(
			false
		);
	});

	/** 无 `g` 标志才敢这么用；换成带 `g` 的正则这里会开始交替真假。 */
	test("同一个输入连问两次答案一致", () => {
		const ref = buildCaseAttachmentRef(ID);

		expect(isCaseAttachmentRef(ref)).toBe(isCaseAttachmentRef(ref));
	});
});
