import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppHeader, AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { MembersPage } from "@/components/members/members-page";
import { MembersTableSkeleton } from "@/components/members/members-table";

export const Route = createFileRoute("/members")({
	component: MembersRoute,
	// SPA 换页不会被读屏播报，<title> 是「我到哪了」的主要线索
	head: () => ({ meta: [{ title: "成员管理 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		/*
		 * 先看角色再预取：非管理员取 users.list 必然 FORBIDDEN，那条失败会走
		 * QueryCache 的全局错误 toast，页面上的「需要管理员权限」还没读完
		 * 就被一条红色报错抢了话。auth.me 未登录返回 null，本身不会抛。
		 */
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.users.list.queryOptions()
			);
		}
	},
	pendingComponent: MembersPending,
});

/*
 * 两层结构，五页同一套（/ai-provider、/api-tokens、/settings、项目列表）：main 是
 * 满宽的滚动容器，居中的内容列在内层 div。分两层的原因：这组类名以前整段写在 main
 * 上，居中的窄列自己就是滚动容器，滚动条挂在这条窄列的右缘，宽屏下离视口右缘几百
 * px（plan 017 的起因）。滚动条属于视口，于是滚动容器与内容列分开：
 * min-h-0 / w-full / flex-1 / overflow-y-auto 留给 main，居中、行长与留白
 * （mx-auto / max-w / px-4 / py-6）搬进内层 div。
 *
 * 居中而不是左对齐：max-w-4xl 以外的余量在宽屏下会全堆到右边，一页内容死贴左缘、
 * 右侧空出一大片。mx-auto 把余量对半分，正文落回视线扫过的中间。
 * 代价是内容左边缘不再与顶栏、侧栏的 px-4 gutter 同线——两条边只在视口窄到装不下
 * max-w 时才重合。接受这笔账：gutter 对齐只是静态的形式一致，正文该落在哪里由眼睛
 * 找它的路径决定，宽屏下后者更值钱。px-4 原样留着，那是窄屏的安全边距。
 *
 * w-full 不能省（五页同理）：这组类名在 main 上时，AppShell 的 SidebarInset 是
 * flex-col，main 的交叉轴是横向的；而 flex 只在两侧交叉轴外边距都不是 auto 时才
 * 拉伸子项，一旦写了 mx-auto 就不再拉伸，宽度退回按内容收缩，窄屏下白缩一截、
 * px-4 也跟着离开视口边缘。搬进内层后 w-full 跟着 mx-auto 一起搬：内层如今躺在
 * 块级滚动容器里，宽度本会自动撑满，但两者结成一对，宽度恒为
 * min(100%, max-w)，这组类名无论落到哪层都不再依赖容器是什么。
 *
 * 加载态与就绪态共用同一份外壳与 main 类名：两份类名迟早会各改各的，而它们之间
 * 任何一处差异都会在数据到达那一帧变成跳动。内层 div 也在壳里，只此一份。
 * min-h-0 与项目列表页对齐：flex 子项不给它就不肯收缩，overflow-y-auto 滚不动。
 */
const MEMBERS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/*
 * 页名放顶栏：这一页的 main 里没有自己的 h1。
 *
 * phase 由两个调用方各自给出、不在这里写死：pending 与就绪是两个组件类型，路由
 * 换它们时必然卸载重挂，PageTransition 光靠 key 压不住，标注了才不会一跳淡入两次。
 * 写死成 "ready" 会把「数据已在缓存里、根本没走 pending」的那种秒开导航也一起吞掉。
 */
function MembersShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell>
			<AppHeader>
				<h1 className="font-medium text-sm">成员管理</h1>
			</AppHeader>
			{/* main 地标、跳转落点与路由级进场动画都在 PageTransition 里 */}
			<PageTransition className={MEMBERS_MAIN} phase={phase}>
				{/* 滚动容器（main）与内容列分离：滚动条贴视口，居中交给这一层 */}
				<div className="mx-auto w-full max-w-4xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}

function MembersPending() {
	return (
		<MembersShell phase="pending">
			<MembersTableSkeleton />
		</MembersShell>
	);
}

function MembersRoute() {
	return (
		<MembersShell phase="ready">
			<MembersPage />
		</MembersShell>
	);
}
