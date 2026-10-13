import { Skeleton } from "@automationstack/ui/components/skeleton";

import { MINDMAP_BODY_CLASS, MINDMAP_PANEL_CLASS } from "./mindmap-layout.ts";

const BRANCH_WIDTHS = ["w-28", "w-36", "w-24"] as const;

/** 与最终布局一致：画布面板、居中的根节点和几个主节点、右下角的工具栏。 */
export function MindmapSkeleton() {
	return (
		<div className={MINDMAP_BODY_CLASS}>
			<output aria-busy="true" className={MINDMAP_PANEL_CLASS}>
				<span className="sr-only">正在加载脑图…</span>
				<div
					aria-hidden="true"
					className="flex flex-1 items-center justify-center gap-16"
				>
					<Skeleton className="h-11 w-36 rounded-xl" />
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
