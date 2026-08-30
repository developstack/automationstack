/**
 * 四格 tab 的面板本身。前三格装的都是原先那个顶级路由的同一个页面组件，
 * 这一层只做两件事：给上作用域提示、给上这一格的行长上限。
 *
 * ## 行长上限逐格给，不统一
 *
 * 这几格原本是各自独立的页面，max-w 是按自己的内容宽度定下来的（理由写在原
 * routes/api-tokens.tsx 顶部）：六列表格取 4xl，纯表单取 3xl。合成一页之后没有
 * 理由把它们拉齐——拉到最宽会让两个表单的输入框在宽屏上横跨一千多像素。
 * tab 条自己是 w-fit，不跟着面板变宽，所以逐格给不会让条与面板的左右边缘打架。
 *
 * 不居中（没有 mx-auto）：同一个项目外壳里相邻的概览、用例、测试任务三页都是从
 * p-4 的 gutter 起排，设置页若居中，在侧栏右侧来回切页时内容的左边缘会横向跳一段。
 */
import { TabsContent } from "@automationstack/ui/components/tabs";

import {
	ApiTokensPage,
	ApiTokensPagePending,
} from "@/components/api-tokens/api-tokens-page";
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
	type SettingsTab,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";
import { TestRunSettingsSection } from "@/components/settings/test-run-settings-section";

/*
 * 纯表单的两格：与搬家前 routes/settings.tsx 的 max-w-3xl 同一档。
 *
 * 形状（flex flex-col gap-4）与下面两个常量一致，而不是只留一个 max-w：眼下
 * 这一格底下确实只挂一个分区组件，节奏全由那个组件自己的
 * `<form className="flex flex-col gap-4">` 提供，加不加 flex 都看不出来；但
 * 少了它，哪天往这一格里再塞一句提示或第二个分区，两块内容就会直接顶在一起
 * ——而另外两格不会，同一页里三种面板给出三种行为正是最难查的那类差异。
 * 单个子元素时 gap 不产生任何间距，所以补齐它对现状是零位移。
 */
const FORM_PANEL = "flex max-w-3xl flex-col gap-4";
/** 六列表格 + 一句作用域提示：max-w 与搬家前 /api-tokens 同一档。 */
const NOTED_TABLE_PANEL = "flex max-w-4xl flex-col gap-4";
/*
 * 纯文字指南 + 一句作用域提示。行长与两个表单格同档（说明文字比表单更需要
 * 这个上限：3xl 之外的一行中文读起来要回扫）。
 *
 * 与 FORM_PANEL 现在逐字相同，仍分两个常量：两者取到同一个值是巧合（一个是
 * 表单的行长、一个是正文的行长），合并之后任何一边想调行长都会连带改掉另一边。
 */
const GUIDE_PANEL = "flex max-w-3xl flex-col gap-4";

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
			<TabsContent className={NOTED_TABLE_PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensPage />
			</TabsContent>
			{/*
			 * 不带 key：这一格与 projectId 没有任何关系（它没有表单初值，也不
			 * 取数），跟着切项目重挂只是白白重建一整页静态文案。
			 */}
			<TabsContent className={GUIDE_PANEL} value={AGENT_TAB}>
				<SettingsScopeNote>{AGENT_SCOPE_NOTE}</SettingsScopeNote>
				<AgentSetupPanel />
			</TabsContent>
		</>
	);
}

/**
 * 路由 pendingComponent 里那一格。
 *
 * 只有 API Token 那一格会走到这里：项目设置与 Jira 那两格的 loader 不等任何
 * 查询（两个分区各自取数、各自失败，理由见 settings-section.tsx 顶部），loader
 * 当场就回，200ms 的 pending 阈值根本够不着，所以那两格返回 null 而不是画一份
 * 永远不会上场的骨架。本地 Agent 接入那一格连查询都没有，同理返回 null。
 *
 * 作用域提示在骨架里也要摆上，且与就绪态是同一个组件：它是静态文案，第一帧就
 * 拿得到；骨架里省掉它，数据到达那一帧整块表格会被凭空插进来的一段说明往下推。
 * 面板的 max-w 与 gap 同理，两态共用上面那几个常量。同一条理由往下再走一层，
 * 所以这里挂的是 ApiTokensPagePending（分区标题 + 按钮行 + 表格骨架）而不是
 * 光秃秃的 ApiTokensTableSkeleton——后者会漏掉那 88px 的标题块与按钮行。
 */
export function SettingsPendingPanel({ tab }: { tab: SettingsTab }) {
	if (tab === TOKENS_TAB) {
		return (
			<TabsContent className={NOTED_TABLE_PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensPagePending />
			</TabsContent>
		);
	}
	return null;
}
