import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ApiTokensPage } from "@/components/api-tokens/api-tokens-page";
import { ApiTokensTableSkeleton } from "@/components/api-tokens/api-tokens-table";
import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";

export const Route = createFileRoute("/api-tokens")({
	component: ApiTokensRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "API Token · 测试用例平台" }] }),
	/*
	 * 直接预取，不先看角色：apiTokens 的三个过程都是 protectedProcedure，
	 * 谁登录了谁就取得到自己那几枚。/members 与 /ai-provider 的 loader 里
	 * 那段「先 auth.me 再决定要不要取」是给 adminProcedure 挡 FORBIDDEN 用的，
	 * 这一页没有那个问题，多绕一次只会让首屏白等一个往返。
	 * 根路由的 beforeLoad 已经把未登录的人挡在登录页了。
	 */
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.orpc.apiTokens.list.queryOptions()
		),
	pendingComponent: ApiTokensPending,
});

/*
 * 与成员管理同一套两层结构：main 满宽当滚动容器，居中的内容列（mx-auto、w-full、
 * max-w-4xl、px-4、py-6）在内层 div——滚动条因此贴视口右缘，而不是挂在这条窄列的
 * 右缘（窄列自己当滚动容器时的老毛病，成因见 plan 017）。居中与 w-full 这几笔
 * 取舍的原文写在 routes/members.tsx 顶部，同为六列表格页，max-w 也跟它取同一档，
 * 五页共用一个结论，改一处就得五处一起改。
 * 加载态与就绪态共用同一份外壳、main 类名与内层 div，两者任何差异都会在数据到达那一帧变成跳动。
 */
const API_TOKENS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/**
 * 页名放顶栏：这一页的 main 里没有自己的 h1。
 *
 * phase 与 /members 同理，由两个调用方各自给出：标注了「骨架 → 就绪」这一跳才只
 * 淡入一次；写死成 "ready" 则连没走 pending 的秒开导航也不再有进场。
 */
function ApiTokensShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell>
			<AppHeader>
				<h1 className="font-medium text-sm">API Token</h1>
			</AppHeader>
			{/* main 地标、跳转落点与路由级进场动画都在 PageTransition 里 */}
			<PageTransition className={API_TOKENS_MAIN} phase={phase}>
				{/* 滚动容器（main）与内容列分离：滚动条贴视口，居中交给这一层 */}
				<div className="mx-auto w-full max-w-4xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}

function ApiTokensPending() {
	return (
		<ApiTokensShell phase="pending">
			<ApiTokensTableSkeleton />
		</ApiTokensShell>
	);
}

function ApiTokensRoute() {
	return (
		<ApiTokensShell phase="ready">
			<ApiTokensPage />
		</ApiTokensShell>
	);
}
