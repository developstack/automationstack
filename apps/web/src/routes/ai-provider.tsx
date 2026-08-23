import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { ProviderConfigPage } from "@/components/provider/provider-config-page";
import { ProviderConfigSkeleton } from "@/components/provider/provider-config-skeleton";

export const Route = createFileRoute("/ai-provider")({
	component: AiProviderRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "AI 配置 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		/*
		 * 先看角色再预取：非管理员取 aiProviderConfig.get 必然 FORBIDDEN，
		 * 那条失败会走 QueryCache 的全局错误 toast，页面上的「需要管理员权限」
		 * 还没读完就被一条红色报错抢了话。auth.me 未登录返回 null，本身不会抛。
		 */
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.aiProviderConfig.get.queryOptions()
			);
		}
	},
	pendingComponent: AiProviderPending,
});

/*
 * 与成员管理同一套：mx-auto 居中、w-full 定住宽度、max-w 只管行长。居中意味着内容
 * 左边缘不再与顶栏的 px-4 gutter 同线，这笔取舍与 w-full 为什么不能省，都写在
 * routes/members.tsx 顶部那段，三页共用一个结论，改一处就得三处一起改。
 * 加载态与就绪态共用同一份外壳与 main 类名，两者任何差异都会在数据到达那一帧变成跳动。
 */
const AI_PROVIDER_MAIN =
	"mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6";

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
				{children}
			</PageTransition>
		</AppShell>
	);
}

function AiProviderPending() {
	return (
		<AiProviderShell phase="pending">
			<ProviderConfigSkeleton />
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
