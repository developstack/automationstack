import type { ReactNode } from "react";

import type { HeaderPathItem } from "@/components/layout/header-path";
import { PageHeader } from "@/components/layout/page-header";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";

const PATH: readonly HeaderPathItem[] = [
	{ key: "platform", label: "平台" },
	{ current: true, key: "auth", label: "认证设置" },
];

/** 表单靠左，最大宽度与项目设置页的表单相同。更宽时单行输入框和中文正文不容易读。 */
const READABLE_FORM = "flex max-w-3xl flex-col gap-4";

export function AuthSettingsShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<PlatformPageShell path={PATH} phase={phase}>
			<PageHeader title="认证设置" />
			<div className={READABLE_FORM}>{children}</div>
		</PlatformPageShell>
	);
}
