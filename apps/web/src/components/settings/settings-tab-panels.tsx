import { TabsContent } from "@automationstack/ui/components/tabs";

import { ApiTokensPage } from "@/components/api-tokens/api-tokens-page";
import { AgentSetupPanel } from "@/components/settings/agent-setup-panel";
import { JiraSettingsSection } from "@/components/settings/jira-settings-section";
import {
	AGENT_SCOPE_NOTE,
	SettingsScopeNote,
	TOKENS_SCOPE_NOTE,
} from "@/components/settings/settings-scope-note";
import {
	AGENT_TAB,
	JIRA_TAB,
	PROJECT_TAB,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";
import { TestRunSettingsSection } from "@/components/settings/test-run-settings-section";

export const PANEL = "flex flex-col gap-4";

/**
 * 两个项目级分区都用 projectId 作 key。
 *
 * 不是为了「刷新」，是因为表单初值只在挂载那一次读服务端状态（见
 * use-jira-config-form.ts 顶部）。换项目走的是 `$projectId` 这个路由参数，
 * 同一个路由组件只是换了参数、并不会重挂，A 项目填了一半的站点地址会原封不动
 * 留在 B 项目的表单里，一按保存就写错了对象。
 */
export function SettingsTabPanels({ projectId }: { projectId: string }) {
	return (
		<>
			<TabsContent className={PANEL} value={PROJECT_TAB}>
				<TestRunSettingsSection
					key={`test-run-${projectId}`}
					projectId={projectId}
				/>
			</TabsContent>
			<TabsContent className={PANEL} value={JIRA_TAB}>
				<JiraSettingsSection key={`jira-${projectId}`} projectId={projectId} />
			</TabsContent>
			<TabsContent className={PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensPage />
			</TabsContent>
			<TabsContent className={PANEL} value={AGENT_TAB}>
				<SettingsScopeNote>{AGENT_SCOPE_NOTE}</SettingsScopeNote>
				<AgentSetupPanel />
			</TabsContent>
		</>
	);
}
