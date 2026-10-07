import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { expect, test } from "vitest";

import {
	type AdfNode,
	buildDefectDescription,
	buildDefectSummary,
} from "./adf";

const RUN_URL = "https://app.example.com/projects/p1/test-runs/r1";

function step(id: string, action: string, expected: string): CaseStep {
	return { expected, id, step: action };
}

function baseInput() {
	return {
		attachmentCount: 0,
		caseName: "登录成功后跳转首页",
		comment: null,
		preconditions: null,
		runName: "8 月回归",
		runUrl: RUN_URL,
		steps: [] as CaseStep[],
	};
}

function flatten(nodes: readonly AdfNode[]): AdfNode[] {
	const out: AdfNode[] = [];
	for (const node of nodes) {
		out.push(node);
		if (node.content) {
			out.push(...flatten(node.content));
		}
	}
	return out;
}

test("描述是 ADF doc 而不是纯文本（v3 收纯文本会 400）", () => {
	const doc = buildDefectDescription(baseInput());
	expect(doc.type).toBe("doc");
	expect(doc.version).toBe(1);
	expect(Array.isArray(doc.content)).toBe(true);
});

test("首段是带 link mark 的平台回链", () => {
	const [first] = buildDefectDescription(baseInput()).content;
	expect(first?.type).toBe("paragraph");
	expect(first?.content?.[0]?.marks?.[0]).toEqual({
		attrs: { href: RUN_URL },
		type: "link",
	});
});

test("步骤渲染成 orderedList，预期跟在各自的动作后面", () => {
	const doc = buildDefectDescription({
		...baseInput(),
		steps: [
			step("s1", "打开登录页", "看到登录表单"),
			step("s2", "输入正确的账号密码并提交", "跳转首页"),
		],
	});
	const list = doc.content.find((node) => node.type === "orderedList");
	expect(list?.content).toHaveLength(2);
	const texts = flatten(list?.content ?? [])
		.filter((node) => node.type === "text")
		.map((node) => node.text);
	expect(texts).toContain("1. 打开登录页");
	expect(texts).toContain("预期：看到登录表单");
});

test("空步骤与空原因整段跳过，不产出空 text 节点（ADF 不允许空串）", () => {
	const doc = buildDefectDescription({
		...baseInput(),
		comment: "   ",
		preconditions: "",
		steps: [step("s1", "  ", "  ")],
	});
	expect(doc.content.every((node) => node.type !== "orderedList")).toBe(true);
	const empties = flatten(doc.content).filter(
		(node) => node.type === "text" && node.text === ""
	);
	expect(empties).toHaveLength(0);
	expect(doc.content.map((node) => node.type)).toEqual(["paragraph"]);
});

test("多行的实际结果用 hardBreak 分行，而不是 text 里塞 \\n", () => {
	const doc = buildDefectDescription({
		...baseInput(),
		comment: "第一行\n第二行",
	});
	const nodes = flatten(doc.content);
	expect(nodes.some((node) => node.type === "hardBreak")).toBe(true);
	expect(
		nodes.some((node) => node.type === "text" && node.text?.includes("\n"))
	).toBe(false);
});

test("附件只写数量不写链接（R2 签名 URL 15 分钟就过期）", () => {
	const doc = buildDefectDescription({ ...baseInput(), attachmentCount: 3 });
	const texts = flatten(doc.content)
		.filter((node) => node.type === "text")
		.map((node) => node.text ?? "");
	expect(texts.some((text) => text.includes("3 个附件"))).toBe(true);
	const links = flatten(doc.content).filter((node) =>
		node.marks?.some((mark) => mark.type === "link")
	);
	expect(links).toHaveLength(1);
});

test("summary 带上测试任务名、压成单行、超长截断", () => {
	expect(
		buildDefectSummary({ caseName: "登录\n失败", runName: "8 月回归" })
	).toBe("[8 月回归] 登录 失败");
	const long = buildDefectSummary({
		caseName: "长".repeat(300),
		runName: "R",
	});
	expect(long.length).toBe(255);
	expect(long.endsWith("…")).toBe(true);
});
