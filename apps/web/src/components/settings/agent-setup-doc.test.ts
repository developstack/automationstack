import { describe, expect, it } from "vitest";

import { buildAgentSetupDoc } from "@/components/settings/agent-setup-doc";

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
		const untouched = buildAgentSetupDoc({ mcpUrl: "", scriptUrl: "" });
		expect(untouched.length).toBeLessThan(buildAgentSetupDoc(VALUES).length);
	});

	it("不碰要原样展示给用户抄的 shell 风格插值占位符", () => {
		const dollar = "$";
		expect(buildAgentSetupDoc(VALUES)).toContain(`Bearer ${dollar}{AS_TOKEN}`);
	});
});
