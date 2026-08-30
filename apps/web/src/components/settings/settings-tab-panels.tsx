/**
 * 五格 tab 的面板本身。每一格装的都是原先那个顶级路由的同一个页面组件，
 * 这一层只做两件事：给上作用域提示、给上这一格的行长上限。
 *
 * ## 面板不按角色渲染，tab 条才按
 *
 * AI 配置与平台账号那两格的 tab 触发器只对管理员出现（判定见 settings-tabs.tsx），
 * 但面板这边**无条件**渲染。这是照搬搬家前的行为，一处不改：以前非管理员的一级
 * 侧栏里同样没有那两项，可手敲 /members 仍然进得去，落地看到的是页面自己那句
 * 「需要管理员权限」（MembersPage / ProviderConfigPage 开头的 role 判断）。如今
 * 手敲 ?tab=members 走到的是同一句话。真正的闸门在后端的 adminProcedure，
 * 前端这两道都只是把 FORBIDDEN 换成一句人话，不是权限本身。
 *
 * Base UI 的 Panel 只按 `value === 选中值` 决定挂不挂，与 tab 条里有没有对应的
 * 触发器无关，所以这条「触发器藏、面板留」的组合成立；缺触发器时它只是少了
 * aria-labelledby 的指向。
 *
 * ## 行长上限逐格给，不统一
 *
 * 这五格原本是五个独立页面，各自的 max-w 是按自己的内容宽度定下来的（理由分别
 * 写在原 routes/members.tsx、routes/ai-provider.tsx 顶部）：六列表格取 4xl，
 * AI 配置七列且 base URL 天生长取 5xl，纯表单取 3xl。合成一页之后没有理由把它们
 * 拉齐——拉到最宽会让两个表单的输入框在宽屏上横跨一千多像素，拉到最窄会把 AI
 * 配置中段几列挤到换行。tab 条自己是 w-fit，不跟着面板变宽，所以逐格给不会让
 * 条与面板的左右边缘打架。
 *
 * 不居中（没有 mx-auto）：同一个项目外壳里相邻的概览、用例、测试任务三页都是从
 * p-4 的 gutter 起排，设置页若居中，在侧栏右侧来回切页时内容的左边缘会横向跳一段。
 */
import { TabsContent } from "@automationstack/ui/components/tabs";

import { ApiTokensPage } from "@/components/api-tokens/api-tokens-page";
import { ApiTokensTableSkeleton } from "@/components/api-tokens/api-tokens-table";
import { MembersPage } from "@/components/members/members-page";
import { MembersTableSkeleton } from "@/components/members/members-table";
import { ProviderConfigPage } from "@/components/provider/provider-config-page";
import { PROVIDER_PAGE_SIZE } from "@/components/provider/provider-config-query";
import { ProviderConfigTableSkeleton } from "@/components/provider/provider-config-skeleton";
import { JiraSettingsSection } from "@/components/settings/jira-settings-section";
import {
	AI_SCOPE_NOTE,
	MEMBERS_SCOPE_NOTE,
	SettingsScopeNote,
	TOKENS_SCOPE_NOTE,
} from "@/components/settings/settings-scope-note";
import {
	AI_TAB,
	JIRA_TAB,
	MEMBERS_TAB,
	PROJECT_TAB,
	type SettingsTab,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";
import { TestRunSettingsSection } from "@/components/settings/test-run-settings-section";

/** 纯表单的两格：与搬家前 routes/settings.tsx 的 max-w-3xl 同一档。 */
const FORM_PANEL = "max-w-3xl";
/** 六列表格 + 一句作用域提示：max-w 与搬家前 /members、/api-tokens 同一档。 */
const NOTED_TABLE_PANEL = "flex max-w-4xl flex-col gap-4";
/** AI 配置七列，base URL 一列天生长，比六列表格页大一档。 */
const NOTED_PROVIDER_PANEL = "flex max-w-5xl flex-col gap-4";

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
			<TabsContent className={FORM_PANEL} value={PROJECT_TAB}>
				<TestRunSettingsSection
					key={`test-run-${projectId}`}
					projectId={projectId}
				/>
			</TabsContent>
			<TabsContent className={FORM_PANEL} value={JIRA_TAB}>
				<JiraSettingsSection key={`jira-${projectId}`} projectId={projectId} />
			</TabsContent>
			<TabsContent className={NOTED_PROVIDER_PANEL} value={AI_TAB}>
				<SettingsScopeNote>{AI_SCOPE_NOTE}</SettingsScopeNote>
				<ProviderConfigPage />
			</TabsContent>
			<TabsContent className={NOTED_TABLE_PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensPage />
			</TabsContent>
			<TabsContent className={NOTED_TABLE_PANEL} value={MEMBERS_TAB}>
				<SettingsScopeNote>{MEMBERS_SCOPE_NOTE}</SettingsScopeNote>
				<MembersPage />
			</TabsContent>
		</>
	);
}

/**
 * 路由 pendingComponent 里那一格。
 *
 * 只有三格会走到这里：项目设置与 Jira 那两格的 loader 不等任何查询（两个分区
 * 各自取数、各自失败，理由见 settings-section.tsx 顶部），loader 当场就回，
 * 200ms 的 pending 阈值根本够不着，所以那两格返回 null 而不是画一份永远不会
 * 上场的骨架。
 *
 * 作用域提示在骨架里也要摆上，且与就绪态是同一个组件：它是静态文案，第一帧就
 * 拿得到；骨架里省掉它，数据到达那一帧整块表格会被凭空插进来的一段说明往下推。
 * 面板的 max-w 与 gap 同理，两态共用上面那几个常量。
 */
export function SettingsPendingPanel({ tab }: { tab: SettingsTab }) {
	if (tab === AI_TAB) {
		return (
			<TabsContent className={NOTED_PROVIDER_PANEL} value={AI_TAB}>
				<SettingsScopeNote>{AI_SCOPE_NOTE}</SettingsScopeNote>
				<ProviderConfigTableSkeleton rows={PROVIDER_PAGE_SIZE} />
			</TabsContent>
		);
	}
	if (tab === TOKENS_TAB) {
		return (
			<TabsContent className={NOTED_TABLE_PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensTableSkeleton />
			</TabsContent>
		);
	}
	if (tab === MEMBERS_TAB) {
		return (
			<TabsContent className={NOTED_TABLE_PANEL} value={MEMBERS_TAB}>
				<SettingsScopeNote>{MEMBERS_SCOPE_NOTE}</SettingsScopeNote>
				<MembersTableSkeleton />
			</TabsContent>
		);
	}
	return null;
}
