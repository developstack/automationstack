import type { ReactNode } from "react";

import type { HeaderPathItem } from "@/components/layout/header-path";
import { PageHeader } from "@/components/layout/page-header";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { StorageSettingsSkeleton } from "@/components/storage-settings/storage-settings-skeleton";

const PATH: readonly HeaderPathItem[] = [
	{ key: "platform", label: "平台" },
	{ current: true, key: "storage", label: "存储设置" },
];

/** 表单靠左，最大宽度与认证设置页相同。 */
const READABLE_FORM = "flex max-w-3xl flex-col gap-4";

export function StorageSettingsShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<PlatformPageShell path={PATH} phase={phase}>
			<PageHeader title="存储设置" />
			<div className={READABLE_FORM}>{children}</div>
		</PlatformPageShell>
	);
}

export function StorageSettingsPending() {
	return (
		<StorageSettingsShell phase="pending">
			<StorageSettingsSkeleton />
		</StorageSettingsShell>
	);
}
