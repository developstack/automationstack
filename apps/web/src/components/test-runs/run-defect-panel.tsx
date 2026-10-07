import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { useQuery } from "@tanstack/react-query";

import { DefectLinkActions } from "@/components/test-runs/run-defect-link-form";
import { LinkedDefect } from "@/components/test-runs/run-defect-linked";
import { orpc } from "@/utils/orpc";

export interface RunDefectPanelProps {
	defectKey: string | null;
	defectStatus: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
	editing: boolean;
	projectId: string;
	runCaseId: string;
}

interface JiraAvailability {
	configured: boolean;
	credentialBroken: boolean;
}

function readJiraAvailability(
	data: JiraConfigState | undefined
): JiraAvailability {
	const state = data ?? null;
	const config = state === null ? null : state.config;
	const credentialProblem = state === null ? null : state.credentialProblem;
	return {
		configured: config !== null && credentialProblem === null,
		credentialBroken: config !== null && credentialProblem !== null,
	};
}

export function RunDefectPanel({
	defectKey,
	defectStatus,
	defectTitle,
	defectUrl,
	editing,
	projectId,
	runCaseId,
}: RunDefectPanelProps) {
	const configQuery = useQuery(
		orpc.jira.getConfig.queryOptions({ input: { projectId } })
	);
	const jira = readJiraAvailability(configQuery.data);
	const linked = defectUrl !== null || defectKey !== null;

	if (!(editing || linked)) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			{linked ? (
				<LinkedDefect
					defectKey={defectKey}
					defectStatus={defectStatus}
					defectTitle={defectTitle}
					defectUrl={defectUrl}
					editing={editing}
					runCaseId={runCaseId}
				/>
			) : null}
			{linked ? null : (
				<DefectLinkActions
					credentialBroken={jira.credentialBroken}
					jiraConfigured={jira.configured}
					runCaseId={runCaseId}
				/>
			)}
		</div>
	);
}
