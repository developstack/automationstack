/**
 * 项目设置页那几个 tab 的标识与顺序，以及 URL 里 `tab` 参数的校验。
 *
 * 「当前在看哪一格」放地址栏而不是组件状态：刷新、后退、把链接贴给同事，三件事
 * 要落在同一格上，只有 URL 能同时满足三者。这条理由与已删掉的 settings-search.ts
 * 里那段同源——那一份管的是「在配哪个项目」，如今由路由参数 `$projectId` 直给，
 * 不再需要一个查询参数来补作用域。
 *
 * 顺序即 tab 条的排列，也是「作用域由近及远」：两个项目级的排前面（人是从项目
 * 侧栏点进来的，默认落点该是这个项目自己的配置），跨项目的三格排后面。
 */
import { z } from "zod";

export const PROJECT_TAB = "project";
export const JIRA_TAB = "jira";
export const AI_TAB = "ai";
export const TOKENS_TAB = "tokens";
export const MEMBERS_TAB = "members";

export const SETTINGS_TABS = [
	PROJECT_TAB,
	JIRA_TAB,
	AI_TAB,
	TOKENS_TAB,
	MEMBERS_TAB,
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** 地址里没带 `tab`（侧栏那条入口就是这样）时的落点。 */
export const DEFAULT_SETTINGS_TAB: SettingsTab = PROJECT_TAB;

export const settingsTabSearchSchema = z.object({
	/**
	 * optional + `.catch(undefined)` 不是可有可无的兜底：手抄断的链接、或指向
	 * 早先某个 tab 名的旧链接，若让 validateSearch 抛出去，整页会掉到路由的错误
	 * 边界上，而这时正确的行为是当作「没指定」，落回默认那一格。
	 */
	tab: z.enum(SETTINGS_TABS).optional().catch(undefined),
});

/** 把 search 里可能缺席的 tab 收成一个确定值，读的一方不必各自兜一遍。 */
export function resolveSettingsTab(tab: SettingsTab | undefined): SettingsTab {
	return tab ?? DEFAULT_SETTINGS_TAB;
}
