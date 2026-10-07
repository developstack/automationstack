import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@automationstack/ui/components/tabs";
import { getRouteApi } from "@tanstack/react-router";
import {
	KeyRoundIcon,
	PlugIcon,
	SlidersHorizontalIcon,
	TerminalIcon,
} from "lucide-react";
import { type ReactNode, useCallback } from "react";

import {
	AGENT_TAB,
	JIRA_TAB,
	PROJECT_TAB,
	resolveSettingsTab,
	SETTINGS_TABS,
	type SettingsTab,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";

const routeApi = getRouteApi("/projects/$projectId/settings");

export const SETTINGS_MAIN = "flex min-h-0 flex-col p-4";

export function useSettingsTab(): SettingsTab {
	return resolveSettingsTab(routeApi.useSearch().tab);
}

function useSelectTab(): (value: unknown) => void {
	const navigate = routeApi.useNavigate();
	return useCallback(
		(value: unknown) => {
			const next = SETTINGS_TABS.find((candidate) => candidate === value);
			if (next !== undefined) {
				navigate({ search: { tab: next } });
			}
		},
		[navigate]
	);
}

function SettingsTabTriggers() {
	return (
		<>
			<TabsTrigger value={PROJECT_TAB}>
				<SlidersHorizontalIcon data-icon="inline-start" />
				项目设置
			</TabsTrigger>
			<TabsTrigger value={JIRA_TAB}>
				<PlugIcon data-icon="inline-start" />
				Jira 集成
			</TabsTrigger>
			<TabsTrigger value={TOKENS_TAB}>
				<KeyRoundIcon data-icon="inline-start" />
				API Token
			</TabsTrigger>
			<TabsTrigger value={AGENT_TAB}>
				<TerminalIcon data-icon="inline-start" />
				本地 Agent 接入
			</TabsTrigger>
		</>
	);
}

export function SettingsTabs({ children }: { children: ReactNode }) {
	const tab = useSettingsTab();
	const selectTab = useSelectTab();

	return (
		<Tabs
			className="mx-auto min-h-0 w-full max-w-4xl flex-1"
			onValueChange={selectTab}
			value={tab}
		>
			<div className="shrink-0 overflow-x-auto">
				<TabsList>
					<SettingsTabTriggers />
				</TabsList>
			</div>
			{children}
		</Tabs>
	);
}
