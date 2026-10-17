import { testRunStatusSchema } from "@automationstack/api/schemas/test-run";
import { z } from "zod";

export const testRunsSearchSchema = z.object({
	runKeyword: z.string().optional(),
	runStatus: testRunStatusSchema.optional(),
});

export type TestRunsSearch = z.infer<typeof testRunsSearchSchema>;

/** 有没有筛选条件（状态或关键词）。 */
export function isFilteredRunSearch(search: TestRunsSearch): boolean {
	return search.runStatus !== undefined || search.runKeyword !== undefined;
}

export function testRunListInput(projectId: string, search: TestRunsSearch) {
	return {
		keyword: search.runKeyword,
		projectId,
		status: search.runStatus,
	};
}
