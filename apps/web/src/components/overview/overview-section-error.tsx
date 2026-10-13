import { Button } from "@automationstack/ui/components/button";
import type { UseQueryResult } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import { getServerMessage } from "@/components/layout/route-error";
import { OverviewSection } from "@/components/overview/overview-section";

const ERROR_FALLBACK = "服务端没有给出原因。";

interface OverviewSectionErrorProps {
	className?: string;
	query: Pick<UseQueryResult, "error" | "isFetching" | "refetch">;
	title: string;
}

/** 区域的数据加载失败时显示原因和重试按钮，不影响其他区域。 */
export function OverviewSectionError({
	className,
	query,
	title,
}: OverviewSectionErrorProps) {
	const { refetch } = query;
	const handleRetry = useCallback(() => {
		refetch().catch(() => undefined);
	}, [refetch]);

	return (
		<OverviewSection className={className} title={title}>
			<div className="flex flex-col items-start gap-3" role="alert">
				<p className="flex items-start gap-2 text-sm">
					<TriangleAlertIcon
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-destructive"
					/>
					<span>
						加载失败：{getServerMessage(query.error) ?? ERROR_FALLBACK}
					</span>
				</p>
				<Button
					onClick={handleRetry}
					pending={query.isFetching}
					size="sm"
					variant="outline"
				>
					重试
				</Button>
			</div>
		</OverviewSection>
	);
}
