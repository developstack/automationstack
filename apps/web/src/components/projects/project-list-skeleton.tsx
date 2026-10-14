import { PageHeaderSkeleton } from "@/components/layout/page-header-skeleton";
import { PROJECT_CARD_GRID } from "@/components/projects/project-card-layout";
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
			<div className={PROJECT_CARD_GRID}>
				{SKELETON_CARD_KEYS.map((key) => (
					<ProjectCardSkeleton key={key} />
				))}
			</div>
		</output>
	);
}
