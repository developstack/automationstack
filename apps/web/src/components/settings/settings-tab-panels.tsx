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

/*
 * 逐格按内容定宽：表格那一格撑满整页（与同外壳的成员、用例两页同宽），
 * 两个表单与那份指南收在 3xl——往宽了拉只会让单行输入框和中文正文都长到读不了。
 *
 * 不是全页一条宽度：设置页原先整页居中，才不得不让四格共用最宽的那一档，
 * 否则窄的那几格会在宽列里靠左摆、看着没居中。现在整页不再居中，
 * 这条约束随之消失。
 */
const READABLE_PANEL = `${PANEL} max-w-3xl`;

export function SettingsTabPanels({ projectId }: { projectId: string }) {
	return (
		<>
			<TabsContent className={READABLE_PANEL} value={PROJECT_TAB}>
				<TestRunSettingsSection
					key={`test-run-${projectId}`}
					projectId={projectId}
				/>
			</TabsContent>
			<TabsContent className={READABLE_PANEL} value={JIRA_TAB}>
				<JiraSettingsSection key={`jira-${projectId}`} projectId={projectId} />
			</TabsContent>
			<TabsContent className={PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensPage />
			</TabsContent>
			<TabsContent className={READABLE_PANEL} value={AGENT_TAB}>
				<SettingsScopeNote>{AGENT_SCOPE_NOTE}</SettingsScopeNote>
				<AgentSetupPanel />
			</TabsContent>
		</>
	);
}
