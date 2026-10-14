import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link, useRouter } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import { PageTransition } from "@/components/layout/page-transition";

/** 与项目以内的页面相同：内容靠左，左右内边距 p-4，不整页居中。 */
const ROUTE_ERROR_MAIN = "min-h-0 w-full overflow-y-auto p-4";

const FALLBACK_DESCRIPTION =
	"服务端没有给出原因。可以重试一次，若一直失败请联系管理员。";

export function getServerMessage(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("message" in error)) {
		return undefined;
	}
	const { message } = error;
	if (typeof message !== "string" || message.trim() === "") {
		return undefined;
	}
	return message;
}

export function RouteError({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	const description = getServerMessage(error) ?? FALLBACK_DESCRIPTION;

	const handleRetry = useCallback(() => {
		router.invalidate();
		reset?.();
	}, [reset, router]);

	return (
		<PageTransition className={ROUTE_ERROR_MAIN}>
			<Empty className="items-start p-0 text-left">
				<EmptyHeader className="items-start">
					<EmptyMedia variant="icon">
						<TriangleAlertIcon />
					</EmptyMedia>
					<EmptyTitle>
						<h1>页面加载失败</h1>
					</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent className="items-start">
					<Button onClick={handleRetry} size="sm">
						重试
					</Button>
					<Link className="text-sm underline underline-offset-4" to="/projects">
						返回项目列表
					</Link>
				</EmptyContent>
			</Empty>
		</PageTransition>
	);
}
