import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { describe, expect, it } from "vitest";

import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";

import {
	type MarkdownBlock,
	parseMarkdownDoc,
} from "@/components/cases/markdown-doc";
import type { MarkdownInline } from "@/components/cases/markdown-inline";

const ATTACHMENT_ID = "11111111-2222-3333-4444-555555555555";
const UPLOAD_TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function flattenInline(blocks: readonly MarkdownBlock[]): MarkdownInline[] {
	const out: MarkdownInline[] = [];
	const visitInline = (nodes: readonly MarkdownInline[]) => {
		for (const node of nodes) {
			out.push(node);
			if (
				node.kind === "emphasis" ||
				node.kind === "link" ||
				node.kind === "strong"
			) {
				visitInline(node.children);
			}
		}
	};
	for (const block of blocks) {
		if (block.kind === "paragraph" || block.kind === "heading") {
			visitInline(block.children);
		} else if (block.kind === "quote") {
			out.push(...flattenInline(block.blocks));
		} else if (block.kind === "list") {
			for (const item of block.items) {
				out.push(...flattenInline(item.blocks));
			}
		}
	}
	return out;
}

function plainText(blocks: readonly MarkdownBlock[]): string {
	return flattenInline(blocks)
		.filter((node) => node.kind === "text" || node.kind === "code")
		.map((node) => node.text)
		.join("");
}

describe("parseMarkdownDoc 不吃字符", () => {
	it.each(["3 * 4", "user_id", "?a=1&b=2", "a_b_c 与 2 * 3 * 4"])(
		"存量纯文本 %s 原样保留",
		(text) => {
			expect(plainText(parseMarkdownDoc(text))).toBe(text);
		}
	);

	it("认不出来的块级语法降级成原文，而不是被丢掉", () => {
		const text = "| a | b |\n| - | - |\n| 1 | 2 |";
		expect(plainText(parseMarkdownDoc(text))).toContain("| 1 | 2 |");
	});

	it("空串与纯换行不炸", () => {
		expect(parseMarkdownDoc("")).toEqual([]);
		expect(parseMarkdownDoc("\n\n\n")).toEqual([]);
		expect(parseMarkdownDoc("   ")).toEqual([]);
	});
});

describe("parseMarkdownDoc 图片", () => {
	it("attachment 引用被识别为图片且 id 正确", () => {
		const blocks = parseMarkdownDoc(buildCaseAttachmentRef(ATTACHMENT_ID));
		const images = flattenInline(blocks).filter(
			(node) => node.kind === "image"
		);
		expect(images).toHaveLength(1);
		expect(images[0]).toMatchObject({
			attachmentId: ATTACHMENT_ID,
			kind: "image",
		});
	});

	it("同一张图重复引用会各自产出一个图片节点", () => {
		const ref = buildCaseAttachmentRef(ATTACHMENT_ID);
		const blocks = parseMarkdownDoc(`${ref}\n${ref}`);
		expect(
			flattenInline(blocks).filter((node) => node.kind === "image")
		).toHaveLength(2);
	});

	it("外链图片不产出图片节点，只当纯文本", () => {
		const text = "![](https://evil.example/x.png)";
		const blocks = parseMarkdownDoc(text);
		expect(
			flattenInline(blocks).filter((node) => node.kind === "image")
		).toHaveLength(0);
		expect(plainText(blocks)).toBe(text);
	});

	it("带 alt 的 attachment 引用也不算数（格式锁死为空 alt）", () => {
		const text = `![截图](attachment:${ATTACHMENT_ID})`;
		expect(
			flattenInline(parseMarkdownDoc(text)).filter(
				(node) => node.kind === "image"
			)
		).toHaveLength(0);
	});

	it("已登记的引用 pending 为 false", () => {
		const blocks = parseMarkdownDoc(buildCaseAttachmentRef(ATTACHMENT_ID));
		expect(
			flattenInline(blocks).find((node) => node.kind === "image")
		).toMatchObject({ pending: false });
	});

	it("uploading 占位是 pending 图片，token 当作查表的键", () => {
		const blocks = parseMarkdownDoc(buildCaseUploadingRef(UPLOAD_TOKEN));
		const images = flattenInline(blocks).filter(
			(node) => node.kind === "image"
		);
		expect(images).toHaveLength(1);
		expect(images[0]).toMatchObject({
			attachmentId: UPLOAD_TOKEN,
			kind: "image",
			pending: true,
		});
	});

	it("uploading 后面不是 uuid 就只是纯文本", () => {
		const text = "![](uploading:foo)";
		const blocks = parseMarkdownDoc(text);
		expect(
			flattenInline(blocks).filter((node) => node.kind === "image")
		).toHaveLength(0);
		expect(plainText(blocks)).toBe(text);
	});
});

describe("parseMarkdownDoc 链接", () => {
	it("javascript: 链接不产出链接节点", () => {
		const text = "[x](javascript:alert(1))";
		const blocks = parseMarkdownDoc(text);
		expect(
			flattenInline(blocks).filter((node) => node.kind === "link")
		).toHaveLength(0);
		expect(plainText(blocks)).toBe(text);
	});

	it("大小写混写的 jAvAsCrIpT: 同样挡住", () => {
		expect(
			flattenInline(parseMarkdownDoc("[x](jAvAsCrIpT:alert(1))")).filter(
				(node) => node.kind === "link"
			)
		).toHaveLength(0);
	});

	it("http/https 链接产出链接节点并保留 href 与文字", () => {
		const blocks = parseMarkdownDoc(
			"见 [文档](https://good.example/a?b=1&c=2)"
		);
		const links = flattenInline(blocks).filter((node) => node.kind === "link");
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({
			kind: "link",
			url: "https://good.example/a?b=1&c=2",
		});
		expect(plainText(blocks)).toContain("文档");
	});
});

describe("parseMarkdownDoc 结构", () => {
	it("标题去掉 # 与其后的空格，并带上层级", () => {
		const blocks = parseMarkdownDoc("## 步骤说明");
		expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 });
		expect(plainText(blocks)).toBe("步骤说明");
	});

	it("5 级标题不在支持范围内，降级成原文", () => {
		expect(plainText(parseMarkdownDoc("##### 太深了"))).toBe("##### 太深了");
	});

	it("有序/无序列表的每一项各自成块", () => {
		const [bullet] = parseMarkdownDoc("- 一\n- 二");
		expect(bullet).toMatchObject({ kind: "list", ordered: false });
		const [ordered] = parseMarkdownDoc("1. 一\n2. 二");
		expect(ordered).toMatchObject({ kind: "list", ordered: true });
	});

	it("围栏代码块只取正文，围栏与语言标注不进结果", () => {
		const blocks = parseMarkdownDoc("```js\nconst a = 1;\n```");
		expect(blocks[0]).toEqual({
			from: 0,
			kind: "code",
			text: "const a = 1;",
		});
	});

	it("强调与行内代码被识别，且内部文本不变", () => {
		const kinds = flattenInline(
			parseMarkdownDoc("**粗** 与 *斜* 与 `user_id`")
		).map((node) => node.kind);
		expect(kinds).toContain("strong");
		expect(kinds).toContain("emphasis");
		expect(kinds).toContain("code");
		expect(plainText(parseMarkdownDoc("`user_id`"))).toBe("user_id");
	});

	it("同一层兄弟节点的 from 互不重复（React key 依赖这一点）", () => {
		const blocks = parseMarkdownDoc("第一段\n\n第二段\n\n# 标题\n\n- 列表");
		const froms = blocks.map((block) => block.from);
		expect(new Set(froms).size).toBe(froms.length);
	});
});
