/**
 * 「本地 Agent 接入」那一格的正文：四节按「先有什么 → 怎么最快装上 → 手工怎么
 * 配 → 装完 agent 凭什么会用」的顺序排下来。
 *
 * 这一格没有任何服务端状态，也没有表单：它是一份接入指南，唯一「算」出来的
 * 只有两个地址。所以既不取数、不需要骨架，也不带 key 随项目重挂。
 */
import { env } from "@automationstack/env/web";
import { useEffect, useMemo, useState } from "react";

import { AgentEndpointSection } from "@/components/settings/agent-endpoint-section";
import { AgentInstallSection } from "@/components/settings/agent-install-section";
import { buildMcpClients } from "@/components/settings/agent-mcp-clients";
import { AgentMcpClientsSection } from "@/components/settings/agent-mcp-clients-section";
import { AgentSkillSection } from "@/components/settings/agent-skill-section";

/** 脚本是 apps/web/public 下的静态文件，路径与文件名一一对应。 */
const SCRIPT_PATH = "/install-agent-skill.sh";
const TRAILING_SLASHES_PATTERN = /\/+$/;

/**
 * MCP 端点长在 **后端**（dev 是 :3000），而这一页长在前端（dev 是 :3001），
 * 所以拼它必须用 VITE_SERVER_URL 而不是浏览器地址栏——理由与
 * jira-form-values.ts 里 buildJiraWebhookUrl 那一段逐字同源。同域反代时两者
 * 本来就相等。
 */
function buildMcpUrl(serverOrigin: string): string {
	const origin = serverOrigin.trim().replace(TRAILING_SLASHES_PATTERN, "");
	return `${origin}/mcp`;
}

/**
 * 安装脚本的绝对地址。
 *
 * 这一个反过来必须用浏览器地址栏的 origin：脚本是 **前端** public 下的静态
 * 文件，拿 VITE_SERVER_URL 拼出来的是一个指向后端的死链。
 *
 * 用 effect 而不是在初值里读 window：这一页是 SSR 出来的，初值里读 window 会
 * 让服务端与首次客户端渲染给出两份不同的 HTML（hydration mismatch）。effect
 * 在挂载后才跑，两侧首帧都是同一份相对路径，随后才补成绝对地址。
 */
function useScriptUrl(): string {
	const [origin, setOrigin] = useState("");
	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);
	return `${origin}${SCRIPT_PATH}`;
}

export function AgentSetupPanel() {
	const mcpUrl = buildMcpUrl(env.VITE_SERVER_URL);
	const scriptUrl = useScriptUrl();
	const clients = useMemo(() => buildMcpClients(mcpUrl), [mcpUrl]);

	return (
		<>
			<AgentEndpointSection mcpUrl={mcpUrl} />
			<AgentInstallSection mcpUrl={mcpUrl} scriptUrl={scriptUrl} />
			<AgentMcpClientsSection clients={clients} />
			<AgentSkillSection />
		</>
	);
}
