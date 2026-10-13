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

const PATH: readonly HeaderPathItem[] = [
	{ current: true, key: "projects", label: "项目" },
];

const PROJECTS_MAIN = "min-h-0 w-full flex-1 overflow-y-auto";

export function ProjectsShell({
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
			<PageTransition className={PROJECTS_MAIN} phase={phase}>
				<div className="mx-auto w-full max-w-5xl px-4 pt-4 pb-6">
					{children}
				</div>
			</PageTransition>
		</AppShell>
	);
}
