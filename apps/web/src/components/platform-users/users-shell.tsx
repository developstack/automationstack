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
import { PLATFORM_USERS_TITLE } from "@/components/platform-users/platform-users-title";

const PATH: readonly HeaderPathItem[] = [
	{ key: "platform", label: "平台" },
	{ current: true, key: "users", label: PLATFORM_USERS_TITLE },
];

const USERS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

export function UsersShell({
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
			<PageTransition className={USERS_MAIN} phase={phase}>
				<div className="mx-auto w-full max-w-5xl px-4 pt-4 pb-6">
					{children}
				</div>
			</PageTransition>
		</AppShell>
	);
}
