import { testRunStatusSchema } from "@automationstack/api/schemas/test-run";
import { z } from "zod";

export const testRunsSearchSchema = z.object({
	runKeyword: z.string().optional(),
	runStatus: testRunStatusSchema.optional(),
});

export type TestRunsSearch = z.infer<typeof testRunsSearchSchema>;

export function testRunListInput(projectId: string, search: TestRunsSearch) {
	return {
		keyword: search.runKeyword,
		projectId,
		status: search.runStatus,
	};
}
