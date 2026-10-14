import type { ReactNode } from "react";

import type { HeaderPathItem } from "@/components/layout/header-path";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { PLATFORM_USERS_TITLE } from "@/components/platform-users/platform-users-title";

const PATH: readonly HeaderPathItem[] = [
	{ key: "platform", label: "平台" },
	{ current: true, key: "users", label: PLATFORM_USERS_TITLE },
];

export function UsersShell({
	children,
	phase,
}: {
	children: ReactNode;
	phase: PageTransitionPhase;
}) {
	return (
		<PlatformPageShell path={PATH} phase={phase}>
			{children}
		</PlatformPageShell>
	);
}
