import { describe, expect, it } from "vitest";

import {
	AGENT_CLIENT_TABS,
	AGENT_DOC_LABELS,
	AGENT_DOC_TABS,
	DEFAULT_AGENT_DOC_TAB,
	resolveAgentDocTab,
} from "@/components/settings/agent-client-tab";
import { buildAgentSetupDoc } from "@/components/settings/agent-setup-doc";

const LEFTOVER_PLACEHOLDER = /\{\{/;

const VALUES = {
	mcpUrl: "https://example.test/mcp",
	scriptUrl: "https://web.example.test/install-agent-skill.sh",
};

describe("buildAgentSetupDoc", () => {
	it("每一格都填完之后不留任何 {{…}} 占位符", () => {
		for (const tab of AGENT_DOC_TABS) {
			expect(buildAgentSetupDoc(tab, VALUES)).not.toMatch(LEFTOVER_PLACEHOLDER);
		}
	});

	it("通用那一格把两个地址都写进正文", () => {
		const doc = buildAgentSetupDoc(DEFAULT_AGENT_DOC_TAB, VALUES);
		expect(doc).toContain(VALUES.mcpUrl);
		expect(doc).toContain(VALUES.scriptUrl);
	});

	it("确实替换掉了东西（正文里原本就有占位符）", () => {
		const untouched = buildAgentSetupDoc("common", {
			mcpUrl: "",
			scriptUrl: "",
		});
		const filled = buildAgentSetupDoc("common", VALUES);
		expect(untouched.length).toBeLessThan(filled.length);
	});

	it("不碰要原样展示给用户抄的 shell 风格插值占位符", () => {
		const dollar = "$";
		expect(buildAgentSetupDoc("claude", VALUES)).toContain(
			`Bearer ${dollar}{AS_TOKEN}`
		);
	});

	it("四家有 MCP 配置的那几格各自带上端点，pi 不带也不影响", () => {
		for (const tab of ["claude", "codex", "opencode", "zcode"] as const) {
			expect(buildAgentSetupDoc(tab, VALUES)).toContain(VALUES.mcpUrl);
		}
		expect(buildAgentSetupDoc("pi", VALUES)).not.toContain(VALUES.mcpUrl);
	});
});

describe("agent client tabs", () => {
	it("通用排在最前，五家客户端跟在后面", () => {
		expect(AGENT_DOC_TABS).toEqual(["common", ...AGENT_CLIENT_TABS]);
	});

	it("每一格都有标签，且没有重复", () => {
		const labels = AGENT_DOC_TABS.map((tab) => AGENT_DOC_LABELS[tab]);
		expect(labels.every((label) => label.length > 0)).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it("没带参数时落在通用那一格", () => {
		expect(resolveAgentDocTab(undefined)).toBe(DEFAULT_AGENT_DOC_TAB);
	});
});
