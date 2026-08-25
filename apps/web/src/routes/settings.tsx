/**
 * 项目级设置页：测试任务自动提交天数 + Jira 集成。
 *
 * 放在一级侧栏（全局作用域）而两项配置都是项目级的，这个错位由页内的项目
 * 选择器补上，理由写在 components/settings/settings-project-picker.tsx。
 */
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { SettingsPage } from "@/components/settings/settings-page";
import { settingsSearchSchema } from "@/components/settings/settings-search";

export const Route = createFileRoute("/settings")({
	component: SettingsRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "设置 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		/*
		 * 只预取项目列表：它决定「在配哪个项目」，没有它连选择器都画不出来。
		 * 两个分区的配置刻意不在这里等——它们要各自失败、互不阻塞，塞进 loader
		 * 就等于把「Jira 配置取不到」变成整页取不到。
		 */
		await context.queryClient.ensureQueryData(
			context.orpc.projects.list.queryOptions()
		);
	},
	pendingComponent: SettingsPending,
	validateSearch: settingsSearchSchema,
});

/*
 * 与 /ai-provider、/api-tokens、/members、项目列表同一套两层结构：main 满宽当滚动
 * 容器，居中的内容列（mx-auto、w-full、max-w-3xl、px-4、py-6）在内层 div——滚动
 * 条因此贴视口右缘，而不是挂在这条窄列的右缘（成因见 plan 017）。五页共用一个结论
 * （居中、w-full 定宽、max-w 只管行长），改一处就得五处一起改，理由写在
 * routes/members.tsx 顶部。
 * 加载态与就绪态必须共用同一份外壳，任何差异都会在数据到达那一帧变成跳动。
 */
const SETTINGS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/** 页名放顶栏：这一页的 main 里没有自己的 h1，两个分区各用 h2。 */
function SettingsShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell>
			<AppHeader>
				<h1 className="font-medium text-sm">设置</h1>
			</AppHeader>
			{/* main 地标、跳转落点与路由级进场动画都在 PageTransition 里 */}
			<PageTransition className={SETTINGS_MAIN} phase={phase}>
				{/* 滚动容器（main）与内容列分离：滚动条贴视口，居中交给这一层 */}
				<div className="mx-auto w-full max-w-3xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}

function SettingsPending() {
	return (
		<SettingsShell phase="pending">
			<output aria-busy="true" className="text-muted-foreground text-sm">
				正在加载设置…
			</output>
		</SettingsShell>
	);
}

function SettingsRoute() {
	return (
		<SettingsShell phase="ready">
			<SettingsPage />
		</SettingsShell>
	);
}
