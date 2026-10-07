import type { AgentDocTab } from "@/components/settings/agent-client-tab";
import claudeCode from "@/components/settings/agent-setup/claude-code.md?raw";
import codex from "@/components/settings/agent-setup/codex.md?raw";
import common from "@/components/settings/agent-setup/common.md?raw";
import opencode from "@/components/settings/agent-setup/opencode.md?raw";
import pi from "@/components/settings/agent-setup/pi.md?raw";
import zcode from "@/components/settings/agent-setup/zcode.md?raw";

const PLACEHOLDER_PATTERN = /\{\{(MCP_URL|SCRIPT_URL)\}\}/g;

/*
 * 一篇 markdown 一格，正文与那格的标签页一一对应；这里只负责把两个地址填进去。
 *
 * pi 那一篇一个占位符都不带（它没有 MCP 配置要抄），这不影响下面这条替换：
 * 没有命中就原样返回。
 */
const SOURCES: Record<AgentDocTab, string> = {
	claude: claudeCode,
	codex,
	common,
	opencode,
	pi,
	zcode,
};

export interface AgentSetupDocValues {
	mcpUrl: string;
	scriptUrl: string;
}

export function buildAgentSetupDoc(
	tab: AgentDocTab,
	values: AgentSetupDocValues
): string {
	return SOURCES[tab].replace(PLACEHOLDER_PATTERN, (_match, key: string) =>
		key === "MCP_URL" ? values.mcpUrl : values.scriptUrl
	);
}
