import { listIngestRunSummaries } from "@automationstack/db/repositories/automation-ingest-repository";
import { projectExists } from "@automationstack/db/repositories/projects-repository";
import { settleAutoSubmitForProject } from "@automationstack/db/repositories/test-run-auto-submit-repository";

import { resolveUserFromBearer } from "../../auth/bearer";
import {
	type IngestRunsResponse,
	ingestRunsQuerySchema,
} from "./execution-contract";
import { formatIngestIssues } from "./format-issues";
import { tokenCanEnterProject } from "./ingest-project-access";

export type IngestRunsOutcome =
	| { kind: "forbidden" }
	| { kind: "invalid-payload"; message: string }
	| { kind: "ok"; response: IngestRunsResponse }
	| { kind: "project-not-found" }
	| { kind: "unauthorized" };

export interface HandleIngestRunsInput {
	authorizationHeader: string | null;
	query: unknown;
}

export async function handleIngestRuns(
	input: HandleIngestRunsInput
): Promise<IngestRunsOutcome> {
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestRunsQuerySchema.safeParse(input.query);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	const { projectId } = parsed.data;
	if (!(await projectExists(projectId))) {
		return { kind: "project-not-found" };
	}
	if (!(await tokenCanEnterProject(user, projectId))) {
		return { kind: "forbidden" };
	}
	await settleAutoSubmitForProject(projectId);
	return {
		kind: "ok",
		response: { runs: await listIngestRunSummaries(projectId) },
	};
}
