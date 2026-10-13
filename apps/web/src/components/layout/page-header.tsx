import { cn } from "@automationstack/ui/lib/utils";
import type { ReactNode } from "react";

import {
	PAGE_HEADER_ROW_CLASS,
	PAGE_HEADER_TITLE_COLUMN_CLASS,
} from "@/components/layout/page-header-layout";

interface PageHeaderProps {
	actions?: ReactNode;
	badge?: ReactNode;
	className?: string;
	summary?: ReactNode;
	title: ReactNode;
}

/**
 * 页面的大标题、一句数据概要和右侧的操作按钮。小号路径在外框顶部的 AppHeader 中。
 * 窄屏下操作按钮换到标题下方，并且可以自己换行，所以不会溢出。
 */
export function PageHeader({
	actions,
	badge,
	className,
	summary,
	title,
}: PageHeaderProps) {
	return (
		<header
			className={cn(PAGE_HEADER_ROW_CLASS, className)}
			data-slot="page-header"
		>
			<div className={PAGE_HEADER_TITLE_COLUMN_CLASS}>
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
					<h1 className="min-w-0 break-words font-semibold text-2xl tracking-tight">
						{title}
					</h1>
					{badge}
				</div>
				{summary === undefined ? null : (
					<p className="text-muted-foreground text-sm">{summary}</p>
				)}
			</div>
			{actions === undefined ? null : (
				<div className="flex max-w-full flex-wrap items-center gap-2">
					{actions}
				</div>
			)}
		</header>
	);
}
