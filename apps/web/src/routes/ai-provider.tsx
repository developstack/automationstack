import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { ProviderConfigPage } from "@/components/provider/provider-config-page";
import {
	PROVIDER_PAGE_SIZE,
	providerListInput,
} from "@/components/provider/provider-config-query";
import { ProviderConfigTableSkeleton } from "@/components/provider/provider-config-skeleton";

export const Route = createFileRoute("/ai-provider")({
	component: AiProviderRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "AI 配置 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		/*
		 * 先看角色再预取：非管理员取 aiProviderConfig.list 必然 FORBIDDEN，
		 * 那条失败会走 QueryCache 的全局错误 toast，页面上的「需要管理员权限」
		 * 还没读完就被一条红色报错抢了话。auth.me 未登录返回 null，本身不会抛。
		 * 预取的是第一页、无关键词——与页面组件初次查询的 input 严格一致，
		 * 才能命中同一份缓存。
		 */
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.aiProviderConfig.list.queryOptions({
					input: providerListInput("", 1),
				})
			);
		}
	},
	pendingComponent: AiProviderPending,
});

/*
 * 与成员管理同一套两层结构：main 满宽当滚动容器，居中的内容列（mx-auto、w-full、
 * max-w-5xl、px-4、py-6）在内层 div——滚动条因此贴视口右缘，而不是挂在这条窄列的
 * 右缘（窄列自己当滚动容器时的老毛病，成因见 plan 017）。居中意味着内容左边缘
 * 不再与顶栏的 px-4 gutter 同线，这笔取舍与 w-full 为什么不能省，都写在
 * routes/members.tsx 顶部那段，多页共用一个结论，改一处就得一起改。
 * max-w-5xl 比六列表格页的 max-w-4xl 大一档：这页七列，且 base URL 一列
 * 天生长（自建网关地址），照六列的档位会把中段几列挤得只剩换行。
 * 加载态与就绪态共用同一份外壳、main 类名与内层 div，两者任何差异都会在数据到达那一帧变成跳动。
 */
const AI_PROVIDER_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/*
 * 页名放顶栏：这一页的 main 里没有自己的 h1。
 *
 * phase 与 /members 同理，由两个调用方各自给出：标注了「骨架 → 就绪」这一跳才只
 * 淡入一次；写死成 "ready" 则连没走 pending 的秒开导航也不再有进场。
 */
function AiProviderShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell>
			<AppHeader>
				<h1 className="font-medium text-sm">AI 配置</h1>
			</AppHeader>
			{/* main 地标、跳转落点与路由级进场动画都在 PageTransition 里 */}
			<PageTransition className={AI_PROVIDER_MAIN} phase={phase}>
				{/* 滚动容器（main）与内容列分离：滚动条贴视口，居中交给这一层 */}
				<div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}

function AiProviderPending() {
	return (
		<AiProviderShell phase="pending">
			<ProviderConfigTableSkeleton rows={PROVIDER_PAGE_SIZE} />
		</AiProviderShell>
	);
}

function AiProviderRoute() {
	return (
		<AiProviderShell phase="ready">
			<ProviderConfigPage />
		</AiProviderShell>
	);
}
