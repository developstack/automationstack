/**
 * 节点管理页的外壳。
 *
 * 与 platform-users/users-shell.tsx、farm-browsers/browsers-shell.tsx 同形而不
 * 共用：那两份各把页名写死，抽出一个「可传标题的通用平台页外壳」看似省事，代价
 * 是每加一页都要回去改那个公共文件、而它的 main 类名一旦为了迁就某一页而动，
 * 另外两页会跟着变形。三页各留十几行、各自解释自己的取值，比共享一层参数化外壳
 * 便宜——与本仓三份 FormError 并存是同一条权衡。
 *
 * 加载态（farm-nodes-pending.tsx）与就绪态（routes/nodes.tsx）共用这一层，
 * 两态之间因此不会有任何布局差异。
 */
import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";

/*
 * 两层结构与另外两张平台页逐字一致：main 满宽当滚动容器，居中的内容列在内层
 * div，滚动条因此贴视口右缘。max-w-5xl 也取同一档——三页共用一条侧栏，来回切时
 * 内容列的左右边缘不该跟着动一下。
 *
 * 加载态与就绪态必须共用同一份 main 类名：两份类名迟早会各改各的，而它们之间
 * 任何一处差异都会在数据到达那一帧变成跳动。
 */
const NODES_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/** phase 由两个调用方各自给出，理由见 users-shell.tsx 里同位置那一段。 */
export function NodesShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell sidebar={<PlatformSidebar />}>
			<AppHeader>
				<h1 className="font-medium text-sm">节点</h1>
			</AppHeader>
			{/* main 地标、跳转落点与路由级进场动画都在 PageTransition 里 */}
			<PageTransition className={NODES_MAIN} phase={phase}>
				{/* 滚动容器（main）与内容列分离：滚动条贴视口，居中交给这一层 */}
				<div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}
