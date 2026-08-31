/**
 * 四格 tab 的面板本身。前三格装的都是原先那个顶级路由的同一个页面组件，
 * 这一层只做一件事：给上作用域提示。
 *
 * ## 宽度不在这一层，四格也不再各有各的宽度
 *
 * 这几格原本是各自独立的页面，max-w 是按自己的内容定的：六列表格取 4xl、两个
 * 表单与指南取 3xl。合成一页、又要求整页居中之后，这个「逐格给」就站不住了：
 * 页面只能按最宽的那一档居中，于是 3xl 的三格会在 4xl 的列里靠左摆，在 1440
 * 的屏上离页面中线偏 64px——四格里有三格看着没居中。
 *
 * 所以现在**全页只有一条宽度**，写在 settings-tabs.tsx 的 Tabs 根上
 * （`mx-auto w-full max-w-4xl`），tab 条与四格面板共用它。面板自己不再带
 * max-w：任意一格都撑满同一列，于是「四格共用一条左边缘」与「每格都真的居中」
 * 同时成立，不必二选一。
 *
 * 取 4xl 而不是 3xl：往宽了统一只是让两个表单的 `w-full` 输入框从 768px 变成
 * 896px，往窄了统一则要把 API Token 那张六列表格（含两列时间）挤进 768px，
 * 那是肉眼可见的退化。真嫌指南的中文行太长，改的是那一条宽度，**不是**给某
 * 一格单独加 max-w——那会立刻把上面那个 64px 的问题原样请回来。
 *
 * ## 居中的已知代价
 *
 * 这里曾经写着「不居中」，理由是相邻的概览、用例、测试任务三页都从 p-4 的
 * gutter 起排，设置页居中会让切页时内容的左边缘横向跳一段。产品明确要求这一页
 * 居中，那条理由作废，但代价照旧存在（切页时左边缘确实会跳），记在这里免得下
 * 一个人把它当 bug 修回去。
 */
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

/*
 * 四格共用的面板形状。宽度由外面那一列给（见文件头），这里只剩纵向节奏。
 *
 * 留着 flex flex-col gap-4 而不是干脆传 undefined：眼下前两格底下确实只挂一个
 * 分区组件，节奏全由那个组件自己的 `<form className="flex flex-col gap-4">`
 * 提供，加不加 flex 都看不出来；但少了它，哪天往那一格里再塞一句提示或第二个
 * 分区，两块内容就会直接顶在一起——而另外两格不会，同一页里两种面板给出两种
 * 行为正是最难查的那类差异。单个子元素时 gap 不产生任何间距，所以对现状是零位移。
 *
 * 四格一个常量而不是四个同值常量：它们现在**必须**相等（宽度统一的前提就是
 * 谁也别单独跑偏），分成四份等于给「各调各的」留了四个入口。导出是为了
 * settings-pending-panel.tsx 那一格能接同一份，理由同上。
 */
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
			{/*
			 * 不带 key：这一格与 projectId 没有任何关系（它没有表单初值，也不
			 * 取数），跟着切项目重挂只是白白重建一整页静态文案。
			 */}
			<TabsContent className={PANEL} value={AGENT_TAB}>
				<SettingsScopeNote>{AGENT_SCOPE_NOTE}</SettingsScopeNote>
				<AgentSetupPanel />
			</TabsContent>
		</>
	);
}
