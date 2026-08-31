import {
	Card,
	CardContent,
	CardHeader,
} from "@automationstack/ui/components/card";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import type { ReactNode } from "react";

/**
 * 报告页各张卡骨架共用的外框（从 report-skeleton.tsx 拆出来）。
 *
 * 外框直接复用真的 <Card>：卡片的内边距与间距写在 --card-spacing 上，
 * 抄一份数值出来那边一改这边就错位。
 *
 * ⚠️ 这里的 h-6 / h-5 出自 report-skeleton.tsx 头注释那张换算表
 * （CardTitle 24px → h-6，CardDescription 21px → h-5），改一个字符就等于
 * 让数据到达那一帧整页跳一下。
 */
interface ReportCardSkeletonProps {
	children: ReactNode;
	/** 描述灰条的宽度类，按各卡描述的实际字数取。 */
	descriptionWidth: string;
	titleWidth: string;
}

/*
 * 不收 className：跨列类名统一写在 report-skeleton.tsx 里 ReportSkeleton 的
 * 包装层上。包了一层之后 grid item 就是那层 div，`xl:col-span-*` 留在 <Card>
 * 上会落在非 grid item 身上，跨列当场失效。
 */
export function ReportCardSkeleton({
	children,
	descriptionWidth,
	titleWidth,
}: ReportCardSkeletonProps) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className={`h-6 ${titleWidth}`} />
				<Skeleton className={`h-5 ${descriptionWidth}`} />
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
