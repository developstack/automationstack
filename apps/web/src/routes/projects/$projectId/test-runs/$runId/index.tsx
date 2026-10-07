import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { PageTransition } from "@/components/layout/page-transition";
import { RunExecutionView } from "@/components/test-runs/run-execution-view";
import type { RouterAppContext } from "@/routes/__root";

const runDetailSearchSchema = z.object({
	runCaseId: z.string().optional(),
});

const EXECUTION_MAIN = "flex min-h-0 flex-col lg:h-full lg:overflow-hidden";

interface RunDetailLoaderData {
	projectName: string;
}

const runDetailLoader = async ({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string; runId: string };
}): Promise<RunDetailLoaderData> => {
	const [project] = await Promise.all([
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.testRuns.get.queryOptions({ input: { runId: params.runId } })
		),
	]);
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/test-runs/$runId/")({
	component: RunExecutionPage,
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试任务 · 测试用例平台`,
			},
		],
	}),
	loader: runDetailLoader,
	pendingComponent: RunExecutionPending,
	validateSearch: runDetailSearchSchema,
});

function RunExecutionPending() {
	return (
		<PageTransition className={EXECUTION_MAIN} phase="pending">
			<p className="p-8 text-center text-muted-foreground text-sm">
				正在载入测试任务…
			</p>
		</PageTransition>
	);
}

function RunExecutionPage() {
	const { projectId, runId } = Route.useParams();
	const { runCaseId } = Route.useSearch();
	const navigate = Route.useNavigate();

	const handleSelectRunCase = useCallback(
		(nextId: string | undefined) => {
			navigate({ replace: true, search: { runCaseId: nextId } });
		},
		[navigate]
	);

	return (
		<PageTransition className={EXECUTION_MAIN} phase="ready">
			<RunExecutionView
				onSelectRunCase={handleSelectRunCase}
				projectId={projectId}
				runId={runId}
				selectedRunCaseId={runCaseId}
			/>
		</PageTransition>
	);
}
