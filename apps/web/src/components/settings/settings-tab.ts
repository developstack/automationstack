import { z } from "zod";

export const PROJECT_TAB = "project";
export const TOKENS_TAB = "tokens";
export const AGENT_TAB = "agent";

export const SETTINGS_TABS = [PROJECT_TAB, TOKENS_TAB, AGENT_TAB] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = PROJECT_TAB;

export const settingsTabSearchSchema = z.object({
	tab: z.enum(SETTINGS_TABS).optional().catch(undefined),
});

export function resolveSettingsTab(tab: SettingsTab | undefined): SettingsTab {
	return tab ?? DEFAULT_SETTINGS_TAB;
}
