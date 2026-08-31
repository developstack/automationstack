/**
 * 概览卡骨架的外框：标题条 + 说明条 + 正文槽。原是 overview-skeleton.tsx 里的
 * 私有辅助，五张卡的骨架都用它，拆分之后由各卡的骨架文件共享。
 *
 * 外框直接复用真的 <Card>/<CardHeader>/<CardContent>，不自己描 py-6 / px-6 / gap：
 * 卡片的内边距与间距写在 --card-spacing 上，抄一份数值出来，那边一改这边就错位。
 */
import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";
import type { ReactNode } from "react";

interface CardSkeletonProps {
	children: ReactNode;
	/** 标题灰条的宽度类，按各卡标题的实际字数取。 */
	descriptionWidth: string;
	titleWidth: string;
}

export function CardSkeleton({
	children,
	descriptionWidth,
	titleWidth,
}: CardSkeletonProps) {
	return (
		<Card aria-hidden="true">
			<CardHeader>
				<Skeleton className={cn("h-6", titleWidth)} />
				<Skeleton className={cn("h-5", descriptionWidth)} />
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
