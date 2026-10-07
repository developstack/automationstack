import { TabsContent } from "@automationstack/ui/components/tabs";

import { ApiTokensPagePending } from "@/components/api-tokens/api-tokens-page-pending";
import {
	SettingsScopeNote,
	TOKENS_SCOPE_NOTE,
} from "@/components/settings/settings-scope-note";
import {
	type SettingsTab,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";
import { PANEL } from "@/components/settings/settings-tab-panels";

export function SettingsPendingPanel({ tab }: { tab: SettingsTab }) {
	if (tab === TOKENS_TAB) {
		return (
			<TabsContent className={PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensPagePending />
			</TabsContent>
		);
	}
	return null;
}
