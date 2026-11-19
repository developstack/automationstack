import type { FeedPage } from "@automationstack/db/repositories/project-stats-activity-core";
import { Button } from "@automationstack/ui/components/button";
import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { ActivityCardSkeleton } from "@/components/overview/activity-card-skeleton";
import { ActivityFeedEntry } from "@/components/overview/activity-feed-entry";
import { FULL_CARD } from "@/components/overview/overview-layout";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { useLoadMoreOnVisible } from "@/components/overview/use-load-more-on-visible";
import { orpc } from "@/utils/orpc";

export const ACTIVITY_CARD_TITLE = "操作日志";

const ACTIVITY_DESCRIPTION = "谁在什么时候修改或删除了用例，最新的在最上面。";

interface ActivityListProps {
	data: InfiniteData<FeedPage, string | undefined>;
	fetchingMore: boolean;
	hasMore: boolean;
	onLoadMore: () => void;
	projectId: string;
}

function ActivityList({
	data,
	fetchingMore,
	hasMore,
	onLoadMore,
	projectId,
}: ActivityListProps) {
	const end = useRef<HTMLDivElement>(null);
	useLoadMoreOnVisible(end, hasMore && !fetchingMore, onLoadMore);
	const entries = data.pages.flatMap((page) => page.entries);
	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				还没有修改或删除用例的记录。
			</p>
		);
	}
	const now = new Date();
	return (
		<div className="scrollbar-none max-h-96 overflow-y-auto">
			<ul aria-label={ACTIVITY_CARD_TITLE} className="flex flex-col divide-y">
				{entries.map((entry) => (
					<ActivityFeedEntry
						entry={entry}
						key={entry.cursor}
						now={now}
						projectId={projectId}
					/>
				))}
			</ul>
			<div className="pt-2" ref={end}>
				{hasMore ? (
					<Button
						className="w-full"
						onClick={onLoadMore}
						pending={fetchingMore}
						size="sm"
						type="button"
						variant="ghost"
					>
						加载更早的记录
					</Button>
				) : null}
			</div>
		</div>
	);
}

interface OverviewActivityCardProps {
	projectId: string;
}

/** 操作日志：项目中修改和删除用例的记录。滚动到底部时加载更早的记录；其他成员修改用例后自动刷新。 */
export function OverviewActivityCard({ projectId }: OverviewActivityCardProps) {
	const query = useInfiniteQuery({
		...orpc.projectStats.activityFeed.infiniteOptions({
			getNextPageParam: (page) => page.nextCursor ?? undefined,
			initialPageParam: undefined as string | undefined,
			input: (cursor: string | undefined) => ({ cursor, projectId }),
		}),
		// 本机的修改不会收到实时通知，所以每次打开概览都重新读取
		staleTime: 0,
	});
	const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
	const loadMore = useCallback(() => {
		fetchNextPage();
	}, [fetchNextPage]);

	return (
		<OverviewQuery
			className={FULL_CARD}
			query={query}
			skeleton={<ActivityCardSkeleton />}
			title={ACTIVITY_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={FULL_CARD}
					description={ACTIVITY_DESCRIPTION}
					title={ACTIVITY_CARD_TITLE}
				>
					<ActivityList
						data={data}
						fetchingMore={isFetchingNextPage}
						hasMore={hasNextPage}
						onLoadMore={loadMore}
						projectId={projectId}
					/>
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}
