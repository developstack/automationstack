/**
 * 接入指南的占位符替换。
 *
 * 这一格没有服务端状态，也没有任何交互：唯一会坏的地方就是两个地址没填进去，
 * 而它的表现是页面上明晃晃印着 `{{MCP_URL}}`——没有报错、没有空态、没有别的
 * 信号。所以这几条断言量的是「正文换了之后占位符还在不在」，而不是文案本身
 * （文案随时会被整段替换，钉住文案等于给换文的人留一堆必须同步改的测试）。
 */
import { describe, expect, it } from "vitest";

import { buildAgentSetupDoc } from "@/components/settings/agent-setup-doc";

/** 任何残留的 `{{` 都算漏填。 */
const LEFTOVER_PLACEHOLDER = /\{\{/;

const VALUES = {
	mcpUrl: "https://example.test/mcp",
	scriptUrl: "https://web.example.test/install-agent-skill.sh",
};

describe("buildAgentSetupDoc", () => {
	it("填完之后正文里不留任何 {{…}} 占位符", () => {
		expect(buildAgentSetupDoc(VALUES)).not.toMatch(LEFTOVER_PLACEHOLDER);
	});

	it("两个地址都真的出现在正文里", () => {
		const doc = buildAgentSetupDoc(VALUES);
		expect(doc).toContain(VALUES.mcpUrl);
		expect(doc).toContain(VALUES.scriptUrl);
	});

	it("确实替换掉了东西（正文里原本就有占位符）", () => {
		// 占位符被改名或写错时，上面两条会以「本来就没有」的方式假绿
		const untouched = buildAgentSetupDoc({ mcpUrl: "", scriptUrl: "" });
		expect(untouched.length).toBeLessThan(buildAgentSetupDoc(VALUES).length);
	});

	it("不碰要原样展示给用户抄的 shell 风格插值占位符", () => {
		// Claude Code 那段配置里的 AS_TOKEN 占位符是内容，不是要替换的槽位；
		// 这里也得像 .md 里那样躲开 noTemplateCurlyInString，故拼一个孤立的 $
		const dollar = "$";
		expect(buildAgentSetupDoc(VALUES)).toContain(`Bearer ${dollar}{AS_TOKEN}`);
	});
});
