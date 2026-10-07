import { createFileRoute } from "@tanstack/react-router";

import { PageTransition } from "@/components/layout/page-transition";
import { TestRunListPageSkeleton } from "@/components/test-runs/test-run-list-page-skeleton";
import {
	TEST_RUN_LIST_MAIN,
	TestRunListView,
} from "@/components/test-runs/test-run-list-view";
import {
	type TestRunsSearch,
	testRunListInput,
	testRunsSearchSchema,
} from "@/components/test-runs/test-runs-search";
import type { RouterAppContext } from "@/routes/__root";

const testRunListLoaderDeps = ({ search }: { search: TestRunsSearch }) => ({
	runStatus: search.runStatus,
});

interface TestRunListLoaderData {
	projectName: string;
}

const testRunListLoader = async ({
	context,
	deps,
	params,
}: {
	context: RouterAppContext;
	deps: { runStatus: TestRunsSearch["runStatus"] };
	params: { projectId: string };
}): Promise<TestRunListLoaderData> => {
	const [project] = await Promise.all([
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.testRuns.list.queryOptions({
				input: testRunListInput(params.projectId, {
					runStatus: deps.runStatus,
				}),
			})
		),
	]);
	return { projectName: project.name };
};

export const Route = createFileRoute("/projects/$projectId/test-runs/")({
	component: TestRunListPage,
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `${loaderData?.projectName ?? "项目"} · 测试评审和执行 · 测试用例平台`,
			},
		],
	}),
	loader: testRunListLoader,
	loaderDeps: testRunListLoaderDeps,
	pendingComponent: TestRunListPending,
	validateSearch: testRunsSearchSchema,
});

function TestRunListPending() {
	return (
		<PageTransition className={TEST_RUN_LIST_MAIN} phase="pending">
			<TestRunListPageSkeleton />
		</PageTransition>
	);
}

function TestRunListPage() {
	const { projectId } = Route.useParams();
	return <TestRunListView projectId={projectId} />;
}
