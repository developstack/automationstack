/**
 * 「本地 Agent 接入」那一格里的子标签页：一格通用说明 + 五家客户端各一格。
 *
 * 通用那一格排在最前且是落点：安装脚本、MCP 端点、九个工具、两个 skill 这几节
 * 对五家是同一份，抄进每格里既会五份各走各的、也会让人以为换个客户端要重读一遍。
 * 各家的差异只在 MCP 配置那一小段，那才是分开的部分。
 */
export const AGENT_COMMON_TAB = "common";

export const AGENT_CLIENT_TABS = [
	"claude",
	"codex",
	"opencode",
	"zcode",
	"pi",
] as const;

export type AgentClientTab = (typeof AGENT_CLIENT_TABS)[number];

export const AGENT_DOC_TABS = [AGENT_COMMON_TAB, ...AGENT_CLIENT_TABS] as const;

export type AgentDocTab = (typeof AGENT_DOC_TABS)[number];

/** 标签用各家自己的写法（`Claude Code` / `opencode`），不翻译、不改大小写。 */
export const AGENT_DOC_LABELS: Record<AgentDocTab, string> = {
	claude: "Claude Code",
	codex: "Codex",
	common: "通用",
	opencode: "opencode",
	pi: "pi",
	zcode: "zcode",
};

export const DEFAULT_AGENT_DOC_TAB: AgentDocTab = AGENT_COMMON_TAB;

export function resolveAgentDocTab(tab: AgentDocTab | undefined): AgentDocTab {
	return tab ?? DEFAULT_AGENT_DOC_TAB;
}
