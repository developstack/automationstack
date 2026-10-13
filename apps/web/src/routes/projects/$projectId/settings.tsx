import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import { SettingsPendingPanel } from "@/components/settings/settings-pending-panel";
import {
	resolveSettingsTab,
	type SettingsTab,
	settingsTabSearchSchema,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";
import { SettingsTabPanels } from "@/components/settings/settings-tab-panels";
import {
	SETTINGS_MAIN,
	SettingsTabs,
	useSettingsTab,
} from "@/components/settings/settings-tabs";
import type { RouterAppContext } from "@/routes/__root";

interface SettingsLoaderData {
	projectName: string;
}

async function prefetchTab(
	context: RouterAppContext,
	tab: SettingsTab
): Promise<void> {
	if (tab !== TOKENS_TAB) {
		return;
	}
	await context.queryClient.ensureQueryData(
		context.orpc.apiTokens.list.queryOptions()
	);
}

const settingsLoader = async ({
	context,
	deps,
	params,
}: {
	context: RouterAppContext;
	deps: { tab: SettingsTab | undefined };
	params: { projectId: string };
}): Promise<SettingsLoaderData> => {
	const project = await context.queryClient.ensureQueryData(
		context.orpc.projects.get.queryOptions({ input: { id: params.projectId } })
	);
	await prefetchTab(context, resolveSettingsTab(deps.tab));
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/settings")({
	component: ProjectSettingsPage,
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.projectName ?? "项目"} · 设置 · 测试用例平台` },
		],
	}),
	loader: settingsLoader,
	loaderDeps: ({ search }) => ({ tab: search.tab }),
	pendingComponent: ProjectSettingsPending,
	validateSearch: settingsTabSearchSchema,
});

function ProjectSettingsPending() {
	const tab = useSettingsTab();
	return (
		<PageTransition className={SETTINGS_MAIN} phase="pending">
			<PageHeader title={WORKSPACE_VIEW_LABELS.settings} />
			<SettingsTabs>
				<SettingsPendingPanel tab={tab} />
			</SettingsTabs>
		</PageTransition>
	);
}

function ProjectSettingsPage() {
	const { projectId } = Route.useParams();
	return (
		<PageTransition className={SETTINGS_MAIN} phase="ready">
			<PageHeader title={WORKSPACE_VIEW_LABELS.settings} />
			<SettingsTabs>
				<SettingsTabPanels projectId={projectId} />
			</SettingsTabs>
		</PageTransition>
	);
}
