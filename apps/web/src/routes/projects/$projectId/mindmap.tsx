import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { MindmapSkeleton } from "@/components/mindmap/mindmap-skeleton";
import { workspaceSearchSchema } from "@/components/workspace/workspace-search";

/**
 * The canvas is a DOM-only library that touches `window` on import, so it is
 * kept out of the server bundle twice over: `ssr: false` skips server rendering
 * of this route, `ClientOnly` skips the hydration pass, and `lazy` makes the
 * chunk itself load in the browser only.
 */
export const Route = createFileRoute("/projects/$projectId/mindmap")({
	component: MindmapPage,
	ssr: false,
	validateSearch: workspaceSearchSchema,
});

const LazyMindmapView = lazy(async () => {
	const module = await import("@/components/mindmap/mindmap-view");
	return { default: module.MindmapView };
});

const FALLBACK = <MindmapSkeleton />;

function MindmapPage() {
	const { projectId } = Route.useParams();
	// 作用域来自 URL：模块树里的脑图按钮、以及列表页选中模块后切过来的 Tab，
	// 带的都是同一个 `moduleId`（schema 里早就有了，这里只是终于用上）。
	const { moduleId } = Route.useSearch();

	/*
	 * main 地标与「跳到主内容」的落点由 PageTransition 给出，脑图页最需要它：
	 * 左侧模块树 + 顶部 Tab 加起来要按几十次 Tab 才能到画布。
	 *
	 * 必须包在 <ClientOnly> 外面而不是写进 MindmapView：ClientOnly 的
	 * fallback、Suspense 的 lazy fallback、以及 MindmapView 自己的
	 * 加载/失败态都不经过 MindmapView 的正常返回值，写在里面这几个分支就没有
	 * 地标、跳转链接会变成死链。
	 *
	 * h-full 是必需的：这一层（PageTransition 渲染出的 main）在高度链上，画布靠
	 * h-full → min-h-0 flex-1 → h-full 这条链从外层的 absolute inset-0
	 * 容器取高度，这里断一环画布高度就塌成 0。
	 */
	return (
		<PageTransition className="h-full">
			<ClientOnly fallback={FALLBACK}>
				<Suspense fallback={FALLBACK}>
					<LazyMindmapView moduleId={moduleId} projectId={projectId} />
				</Suspense>
			</ClientOnly>
		</PageTransition>
	);
}
