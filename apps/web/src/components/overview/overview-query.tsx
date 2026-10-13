import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { OverviewSectionError } from "@/components/overview/overview-section-error";

interface OverviewQueryProps<TData> {
	children: (data: TData) => ReactNode;
	className?: string;
	query: UseQueryResult<TData>;
	skeleton: ReactNode;
	title: string;
}

/** 有数据就显示数据；没有数据时，加载失败显示重试，否则显示骨架屏。 */
export function OverviewQuery<TData>({
	children,
	className,
	query,
	skeleton,
	title,
}: OverviewQueryProps<TData>) {
	if (query.data !== undefined) {
		return children(query.data);
	}
	if (query.isError) {
		return (
			<OverviewSectionError className={className} query={query} title={title} />
		);
	}
	return skeleton;
}
