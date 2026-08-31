/**
 * 项目设置页的 tab 条，以及包住四格面板的 Tabs 根。
 *
 * 触发器一项一个组件、不由数组渲染，写法照抄 project-nav-group.tsx：共性只有
 * 「一个图标加一行字」，各自的理由（见下）并不相同。
 *
 * 图标沿用搬家前一级侧栏上那几枚（KeyRoundIcon 等）：这几格的入口是从侧栏挪
 * 过来的，认图标比重新认位置快；两处若换成不同的图标，等于让用惯了的人重新
 * 学一遍。
 */
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

/**
 * 这一页 <main> 的类名。
 *
 * p-4 = 内容区 gutter 16px，与顶栏的 px-4 落在同一条线上（约定见
 * components/workspace/module-tree.tsx 顶部），与同一个项目外壳里的概览、用例、
 * 测试任务三页同档。滚动交给父路由 route.tsx 里那层 absolute inset-0
 * overflow-y-auto，这里不再自己开一个滚动容器——两层滚动会让滚动条离开视口右缘。
 *
 * 导出而不是就地写死：路由的 pendingComponent 要落在同一份类名上。两处各写一份
 * 迟早会各改各的，而它们之间任何一处差异都会在数据到达那一帧变成跳动。
 */
export const SETTINGS_MAIN = "flex min-h-0 flex-col p-4";

/** 当前这一格。search 里可能没带 tab，收口在 resolveSettingsTab 一处。 */
export function useSettingsTab(): SettingsTab {
	return resolveSettingsTab(routeApi.useSearch().tab);
}

/**
 * 切 tab = 一次只动 search 的导航。
 *
 * 不 replace：四格之间来回走是真的换了地方，压进历史栈之后按后退能退回上一格，
 * 这与「同一格里改了个筛选」不是一回事。而 pathname 不变，PageTransition 那条
 * 判定据此跳过进场动画（见 page-transition.tsx），切 tab 不会整页淡入一次。
 */
function useSelectTab(): (value: unknown) => void {
	const navigate = routeApi.useNavigate();
	return useCallback(
		(value: unknown) => {
			// Base UI 的 value 是 any；从白名单里找回来，既收窄了类型也不必写断言
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
			{/*
			 * API Token 不按角色收起：apiTokens 那三个过程都是 protectedProcedure，
			 * 每个人只管得到自己那几枚。藏起来等于普通成员永远接不上 CI——这条
			 * 理由与搬家前一级侧栏里那一项逐字同源。
			 */}
			<TabsTrigger value={TOKENS_TAB}>
				<KeyRoundIcon data-icon="inline-start" />
				API Token
			</TabsTrigger>
			{/*
			 * 终端图标而不是机器人/星星：这一格不是「用平台的 AI」，恰恰相反——
			 * 平台把 MCP 接口和 skill 开出来，跑 agent 的是用户自己的命令行。
			 * 用 SparklesIcon 那类图标会把它读成又一个内置 AI 功能。
			 */}
			<TabsTrigger value={AGENT_TAB}>
				<TerminalIcon data-icon="inline-start" />
				本地 Agent 接入
			</TabsTrigger>
		</>
	);
}

/**
 * Tabs 根：tab 条 + 调用方塞进来的面板。
 *
 * 面板由调用方给（就绪态是四格，pending 态只有当前那一格），而 tab 条与选中值
 * 由这一层统一给出：两态若各画一条 tab 条，条的高度、图标、可见项迟早会分叉，
 * 而 loader 慢的那一格正好会在 pending → 就绪之间把两条并排给人看一遍。
 *
 * ## 这一行 className 是整页唯一的宽度与居中
 *
 * `mx-auto w-full max-w-4xl`：tab 条与四格面板同在这个根之下，于是它们共用同一
 * 条左边缘、同一条右边缘、同一条中线——**切到哪一格，正文都在页面中线上**。
 *
 * 两条别改错的：
 * - 别逐格 mx-auto。tab 条是 w-fit，它自己居中之后左边缘会落到面板左边缘右侧，
 *   切一次 tab 就晃一次；面板若再各按各的 max-w 居中，就是每格一条左边缘。
 * - 别给某一格单独留 max-w。那等于让这一页重新有两种宽度，而页面只能按最宽的
 *   那一档居中，窄的那几格立刻偏离中线（这正是上一版 64px 偏移的成因）。
 *   要调行长就调这里，四格一起动。宽度为什么落在 4xl：见
 *   settings-tab-panels.tsx 顶部。
 *
 * tab 条外面那层 overflow-x-auto：TabsList 是 inline-flex w-fit 且不换行，四格
 * 「图标 + 中文」在窄屏上未必装得下。让它在自己那一行里横向滚，而不是撑破内容列
 * 把整页顶出横向滚动条——后者会连带把下面的表单和表格一起推出视口。
 * shrink-0 防止它在 flex 列里被下面的面板压扁。
 */
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
