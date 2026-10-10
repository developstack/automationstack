import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppShell } from "@/components/layout/app-shell";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PageTransition } from "@/components/layout/page-transition";
import { PlatformSidebar } from "@/components/layout/platform-sidebar";

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
				<h1 className="font-medium text-sm">认证设置</h1>
			</AppHeader>
			<PageTransition className={AUTH_SETTINGS_MAIN} phase={phase}>
				<div className="mx-auto w-full max-w-3xl px-4 py-6">{children}</div>
			</PageTransition>
		</AppShell>
	);
}
