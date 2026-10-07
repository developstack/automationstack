import guide from "@/components/settings/agent-setup-guide.md?raw";

/**
 * 正文里的占位符。
 *
 * 用 `{{…}}` 而不是 `${…}`：这份 .md 是纯文本、不经过任何模板引擎，而它内部
 * 恰好要原样展示 Claude Code 的 `${AS_TOKEN}` 插值语法——两者共用一种写法的话，
 * 页面上给用户抄的那个占位符会在这里被当成待替换的槽位填掉。
 */
const PLACEHOLDER_PATTERN = /\{\{(MCP_URL|SCRIPT_URL)\}\}/g;

export interface AgentSetupDocValues {
	mcpUrl: string;
	scriptUrl: string;
}

export function buildAgentSetupDoc(values: AgentSetupDocValues): string {
	return guide.replace(PLACEHOLDER_PATTERN, (_match, key: string) =>
		key === "MCP_URL" ? values.mcpUrl : values.scriptUrl
	);
}
