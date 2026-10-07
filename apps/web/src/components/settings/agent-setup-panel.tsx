import { env } from "@automationstack/env/web";
import { useEffect, useState } from "react";

import { DocMarkdown } from "@/components/docs/doc-markdown";
import { buildAgentSetupDoc } from "@/components/settings/agent-setup-doc";

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
 *
 * 它只喂给正文里的 `curl -O` 那一行——`curl` 拿不到浏览器的当前地址，必须给
 * 绝对地址。正文里那条**下载链接**反过来用的是相对路径 `/install-agent-skill.sh`：
 * `download` 属性对跨源 URL 会被浏览器静默忽略，而首帧还没跑 effect 时这里给出
 * 的绝对地址是空 origin 拼出来的，两条理由都指向相对路径。渲染器据此加
 * `download`（见 docs/doc-markdown.tsx 的 STATIC_ASSET_HREF），点一下是存到本地，
 * 不是在新标签里摊开一屏源码。
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

	return <DocMarkdown text={buildAgentSetupDoc({ mcpUrl, scriptUrl })} />;
}
