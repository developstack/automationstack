import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import { getServerMessage } from "@/components/layout/route-error";

const ERROR_FALLBACK = "服务端没有给出原因。";

interface CaseListErrorProps {
	query: {
		error: unknown;
		isFetching: boolean;
		refetch: () => Promise<unknown>;
	};
}

/** 用例列表加载失败时显示在表格的位置：原因和重试按钮。筛选栏仍然可以使用。 */
export function CaseListError({ query }: CaseListErrorProps) {
	const { refetch } = query;
	const handleRetry = useCallback(() => {
		refetch().catch(() => undefined);
	}, [refetch]);

	return (
		<Empty role="alert">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<TriangleAlertIcon aria-hidden="true" className="text-destructive" />
				</EmptyMedia>
				<EmptyTitle>用例列表加载失败</EmptyTitle>
				<EmptyDescription>
					{getServerMessage(query.error) ?? ERROR_FALLBACK}
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button
					onClick={handleRetry}
					pending={query.isFetching}
					size="sm"
					variant="outline"
				>
					<RotateCwIcon data-icon="inline-start" />
					重试
				</Button>
			</EmptyContent>
		</Empty>
	);
}
