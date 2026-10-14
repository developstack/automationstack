import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppShell } from "@/components/layout/app-shell";
import {
	HeaderPath,
	type HeaderPathItem,
} from "@/components/layout/header-path";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";

const PLATFORM_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

/*
 * 页面内容靠左，左右内边距与项目以内的页面（p-4）相同。整页不居中，也不设最大宽度：
 * 表格撑满内容区，表单和长段正文由各页面自己限制在 max-w-3xl。
 */
const PLATFORM_PAGE_BODY = "flex flex-col gap-4 px-4 pt-4 pb-6";

interface PlatformPageShellProps {
	children: ReactNode;
	path: readonly HeaderPathItem[];
	phase: PageTransitionPhase;
}

/** 项目以外的页面（项目列表、平台用户管理、认证设置）共用的外框。 */
export function PlatformPageShell({
	children,
	path,
	phase,
}: PlatformPageShellProps) {
	return (
		<AppShell sidebar={<PlatformSidebar />}>
			<AppHeader>
				<HeaderPath items={path} />
			</AppHeader>
			<PageTransition className={PLATFORM_MAIN} phase={phase}>
				<div className={PLATFORM_PAGE_BODY}>{children}</div>
			</PageTransition>
		</AppShell>
	);
}
