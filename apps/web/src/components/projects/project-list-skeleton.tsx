import { PageHeaderSkeleton } from "@/components/layout/page-header-skeleton";
import { ProjectCardSkeleton } from "@/components/skeletons/project-card-skeleton";

const SKELETON_CARD_KEYS = ["c1", "c2", "c3"] as const;

export function ProjectListSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="项目列表加载中"
			className="flex flex-col gap-4"
		>
			<PageHeaderSkeleton actionCount={1} />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{SKELETON_CARD_KEYS.map((key) => (
					<ProjectCardSkeleton key={key} />
				))}
			</div>
		</output>
	);
}
