import { env } from "@automationstack/env/web";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@automationstack/ui/components/tabs";
import { useCallback, useEffect, useState } from "react";

import { DocMarkdown } from "@/components/docs/doc-markdown";
import {
	AGENT_DOC_LABELS,
	AGENT_DOC_TABS,
	type AgentDocTab,
	DEFAULT_AGENT_DOC_TAB,
} from "@/components/settings/agent-client-tab";
import { buildAgentSetupDoc } from "@/components/settings/agent-setup-doc";
import { SettingsSection } from "@/components/settings/settings-section";

/** 脚本是 apps/web/public 下的静态文件，路径与文件名一一对应。 */
const SCRIPT_PATH = "/install-agent-skill.sh";
const TRAILING_SLASHES_PATTERN = /\/+$/;

const HEADING_ID = "settings-agent-heading";
const SECTION_TITLE = "本地 Agent 接入";
const SECTION_DESCRIPTION =
	"平台不再内置在线 AI，用例读写开成一个 MCP 接口，交给你自己的命令行 agent。先看「通用」，再照你手上那一家抄配置。";

/** MCP 端点长在后端、这一页长在前端，拼它得用 VITE_SERVER_URL 而不是地址栏。 */
function buildMcpUrl(serverOrigin: string): string {
	const origin = serverOrigin.trim().replace(TRAILING_SLASHES_PATTERN, "");
	return `${origin}/mcp`;
}

/**
 * 安装脚本反过来在前端 public 下，必须用地址栏的 origin。
 *
 * 用 effect 而不是在初值里读 window：这一页是 SSR 出来的，初值里读 window 会让
 * 服务端与首次客户端渲染给出两份不同的 HTML。
 */
function useScriptUrl(): string {
	const [origin, setOrigin] = useState("");
	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);
	return `${origin}${SCRIPT_PATH}`;
}

/**
 * 子标签页放组件状态而不是地址栏。
 *
 * 与设置页那四条 tab 不同：那四条各自是独立的一格，链接贴给同事、刷新、后退都
 * 要落在同一格上；这里选的是同一份说明里读到哪一节，位置由外层的 `?tab=agent`
 * 已经交代清楚。同一页里的详情/版本历史那个二级 tab 也是这么处理的。
 */
function useAgentDocTab(): [AgentDocTab, (value: unknown) => void] {
	const [tab, setTab] = useState<AgentDocTab>(DEFAULT_AGENT_DOC_TAB);
	const select = useCallback((value: unknown) => {
		const next = AGENT_DOC_TABS.find((candidate) => candidate === value);
		if (next !== undefined) {
			setTab(next);
		}
	}, []);
	return [tab, select];
}

export function AgentSetupPanel() {
	const mcpUrl = buildMcpUrl(env.VITE_SERVER_URL);
	const scriptUrl = useScriptUrl();
	const [tab, selectTab] = useAgentDocTab();

	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<Tabs
				className="min-h-0 w-full gap-3"
				onValueChange={selectTab}
				value={tab}
			>
				<div className="shrink-0 overflow-x-auto">
					<TabsList>
						{AGENT_DOC_TABS.map((value) => (
							<TabsTrigger key={value} value={value}>
								{AGENT_DOC_LABELS[value]}
							</TabsTrigger>
						))}
					</TabsList>
				</div>
				{AGENT_DOC_TABS.map((value) => (
					<TabsContent key={value} value={value}>
						<DocMarkdown
							text={buildAgentSetupDoc(value, { mcpUrl, scriptUrl })}
						/>
					</TabsContent>
				))}
			</Tabs>
		</SettingsSection>
	);
}
