import type { RouterAppContext } from "@/routes/__root";

export interface ReportLoaderData {
	projectName: string;
}

/** 报告页的数据：项目名称和报告。测试任务下的报告页和测试报告下的报告页共用。 */
export async function reportLoader({
	context,
	params,
}: {
	context: RouterAppContext;
	params: { projectId: string; runId: string };
}): Promise<ReportLoaderData> {
	const [project] = await Promise.all([
		context.queryClient.ensureQueryData(
			context.orpc.projects.get.queryOptions({
				input: { id: params.projectId },
			})
		),
		context.queryClient.ensureQueryData(
			context.orpc.testRuns.report.queryOptions({
				input: { runId: params.runId },
			})
		),
	]);
	return { projectName: project.name };
}
