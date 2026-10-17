import { Skeleton } from "@automationstack/ui/components/skeleton";

import { MINDMAP_BODY_CLASS, MINDMAP_PANEL_CLASS } from "./mindmap-layout.ts";

const BRANCH_WIDTHS = ["w-28", "w-36", "w-24"] as const;

interface MindmapSkeletonProps {
	/** 只看一个模块时，面板顶部有「返回全量脑图」的说明栏。 */
	scoped: boolean;
}

/** 与最终布局一致：画布面板、居中的根节点和几个主节点、右下角的工具栏。 */
export function MindmapSkeleton({ scoped }: MindmapSkeletonProps) {
	return (
		<div className={MINDMAP_BODY_CLASS}>
			<output aria-busy="true" className={MINDMAP_PANEL_CLASS}>
				<span className="sr-only">正在加载脑图…</span>
				{scoped ? (
					<div
						aria-hidden="true"
						className="flex items-center gap-3 border-b bg-card px-3 py-2"
					>
						<Skeleton className="h-4 w-40" />
						<Skeleton className="ml-auto h-7 w-28" />
					</div>
				) : null}
				<div
					aria-hidden="true"
					className="flex flex-1 items-center justify-center gap-16"
				>
					<Skeleton className="h-11 w-36 rounded-lg" />
					<div className="flex flex-col gap-6">
						{BRANCH_WIDTHS.map((width) => (
							<Skeleton className={`h-9 ${width}`} key={width} />
						))}
					</div>
				</div>
				<Skeleton
					aria-hidden="true"
					className="absolute right-3 bottom-3 h-9 w-48 rounded-lg"
				/>
			</output>
		</div>
	);
}
