/**
 * 设置页主体：先确定「在配哪个项目」，再挂两个互不相干的分区。
 *
 * 页面本身不取任何配置——两个分区各自取数、各自保存、各自失败（见
 * settings-section.tsx 顶部）。这里只负责作用域这一件事。
 */
import type { Project } from "@automationstack/db/schema/projects";
import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { JiraSettingsSection } from "@/components/settings/jira-settings-section";
import {
	readRecentProjectId,
	rememberRecentProjectId,
} from "@/components/settings/recent-project";
import { SettingsProjectPicker } from "@/components/settings/settings-project-picker";
import { TestRunSettingsSection } from "@/components/settings/test-run-settings-section";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/settings");

/** URL 里指定的项目当前是否还在（可能已被别人删掉）。 */
function findProject(projects: Project[], id: string | undefined) {
	return id === undefined ? undefined : projects.find((p) => p.id === id);
}

/**
 * 把选中项目写回地址栏，并记进「最近访问」。
 *
 * replace 由调用方给：默认解析出来的那次是补全 URL，不是一次导航，若压进
 * 历史栈，用户按后退会回到同一个页面（只是少了 query），像是卡住了。
 */
function useSelectProject() {
	const navigate = routeApi.useNavigate();
	return useCallback(
		(projectId: string, replace: boolean) => {
			rememberRecentProjectId(projectId);
			navigate({ replace, search: { projectId } });
		},
		[navigate]
	);
}

/**
 * 决定当前项目：URL 优先，其次「最近访问」，最后列表第一个。
 *
 * URL 里带着一个查不到的 id 时**不自动改写**——那多半是项目刚被删，或链接
 * 是别人贴来的；悄悄换成另一个项目，人可能对着错的项目改完配置还不知道。
 * 这种情况留给下面的 MissingProjectNotice 明说。
 */
function useCurrentProject(projects: Project[]): Project | undefined {
	const { projectId } = routeApi.useSearch();
	const select = useSelectProject();
	const current = findProject(projects, projectId);
	const needsDefault = projectId === undefined && projects.length > 0;
	const fallbackId = projects[0]?.id;

	useEffect(() => {
		if (!needsDefault || fallbackId === undefined) {
			return;
		}
		const recent = readRecentProjectId();
		const recentStillExists = projects.some((p) => p.id === recent);
		select(recentStillExists && recent !== null ? recent : fallbackId, true);
	}, [fallbackId, needsDefault, projects, select]);

	return current;
}

function MissingProjectNotice() {
	return (
		<div className="rounded-lg bg-muted p-3 text-xs" role="status">
			<p>地址里指定的项目不存在，可能已被删除。请在上面重新选择一个项目。</p>
		</div>
	);
}

/** 一个项目都没有时，这一页无事可配；直接把人送去建项目。 */
function NoProjectsNotice() {
	return (
		<div className="flex flex-col items-start gap-3">
			<p className="text-muted-foreground text-sm">
				还没有任何项目。这两项配置都是项目级的，先建一个项目再回来配置。
			</p>
			<Button render={<Link to="/projects" />} size="sm" variant="outline">
				去项目管理
			</Button>
		</div>
	);
}

function SettingsPageSkeleton() {
	return (
		<output aria-busy="true" className="flex flex-col gap-6">
			<Skeleton className="h-8 w-72" />
			<Skeleton className="h-40 w-full" />
		</output>
	);
}

/**
 * 两个分区都用 projectId 作 key。
 *
 * 不是为了「刷新」，是因为表单初值只在挂载那一次读服务端状态（见
 * use-jira-config-form.ts 顶部）：换项目若不重挂，A 项目填了一半的站点地址
 * 会原封不动留在 B 项目的表单里，一按保存就写错了对象。
 */
function SettingsSections({ projectId }: { projectId: string }) {
	return (
		<>
			<TestRunSettingsSection
				key={`test-run-${projectId}`}
				projectId={projectId}
			/>
			<Separator />
			<JiraSettingsSection key={`jira-${projectId}`} projectId={projectId} />
		</>
	);
}

function SettingsPageBody({ projects }: { projects: Project[] }) {
	const { projectId } = routeApi.useSearch();
	const current = useCurrentProject(projects);
	const select = useSelectProject();
	const handleSelect = useCallback(
		(next: string) => select(next, false),
		[select]
	);

	if (projects.length === 0) {
		return <NoProjectsNotice />;
	}

	// URL 指了一个查不到的项目：不报错、不改写，说清楚并等人重选
	const missing = projectId !== undefined && current === undefined;

	return (
		<div className="flex flex-col gap-6">
			<SettingsProjectPicker
				onSelect={handleSelect}
				projects={projects}
				selectedId={current?.id}
			/>
			{missing ? <MissingProjectNotice /> : null}
			{current === undefined ? null : (
				<SettingsSections projectId={current.id} />
			)}
		</div>
	);
}

export function SettingsPage() {
	const projectsQuery = useQuery(orpc.projects.list.queryOptions());

	if (projectsQuery.isPending) {
		return <SettingsPageSkeleton />;
	}
	// 项目列表都没拿到就没法确定作用域；全局 toast 已经报过一次失败原因
	if (projectsQuery.data === undefined) {
		return (
			<p className="text-destructive text-sm" role="status">
				项目列表没能加载出来，请刷新页面重试。
			</p>
		);
	}
	return <SettingsPageBody projects={projectsQuery.data} />;
}
