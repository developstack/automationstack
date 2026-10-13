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
		<PageTransition className="container mx-auto flex max-w-5xl items-center px-4 py-6">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<TriangleAlertIcon />
					</EmptyMedia>
					<EmptyTitle>
						<h1>页面加载失败</h1>
					</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
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
