import type { ReactNode } from "react";

import type { HeaderPathItem } from "@/components/layout/header-path";
import type { PageTransitionPhase } from "@/components/layout/page-transition";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";

const PATH: readonly HeaderPathItem[] = [
	{ current: true, key: "projects", label: "项目" },
];

export function ProjectsShell({
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
