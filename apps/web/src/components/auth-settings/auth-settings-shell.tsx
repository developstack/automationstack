import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppShell } from "@/components/layout/app-shell";
import {
	HeaderPath,
	type HeaderPathItem,
} from "@/components/layout/header-path";
import { PageHeader } from "@/components/layout/page-header";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";

const PATH: readonly HeaderPathItem[] = [
	{ key: "platform", label: "平台" },
	{ current: true, key: "auth", label: "认证设置" },
];

const AUTH_SETTINGS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

export function AuthSettingsShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<AppShell sidebar={<PlatformSidebar />}>
			<AppHeader>
				<HeaderPath items={PATH} />
			</AppHeader>
			<PageTransition className={AUTH_SETTINGS_MAIN} phase={phase}>
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-6">
					<PageHeader title="认证设置" />
					{children}
				</div>
			</PageTransition>
		</AppShell>
	);
}
