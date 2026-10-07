import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { CredentialProblemNotice } from "@/components/settings/credential-problem-notice";
import { JiraConfigFields } from "@/components/settings/jira-config-fields";
import { JiraConfigFormActions } from "@/components/settings/jira-config-form-actions";
import { JiraConnectionResult } from "@/components/settings/jira-connection-result";
import { useFieldHandlers } from "@/components/settings/jira-field-group";
import {
	SettingsFieldsSkeleton,
	type SettingsSkeletonAction,
	type SettingsSkeletonField,
} from "@/components/settings/settings-fields-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { SettingsSectionError } from "@/components/settings/settings-section-error";
import { useJiraConfigForm } from "@/components/settings/use-jira-config-form";
import { orpc } from "@/utils/orpc";

const HEADING_ID = "settings-jira-heading";
const SECTION_TITLE = "Jira 集成";
const SECTION_DESCRIPTION =
	"配置后，失败用例可一键建 issue、粘贴链接反向关联，并由 webhook 同步 issue 状态。未配置也不影响测试任务的任何功能。";

const SKELETON_FIELDS: readonly SettingsSkeletonField[] = [
	{ hint: false, id: "site-url", width: "w-full" },
	{ hint: false, id: "email", width: "w-full" },
	{ hint: true, id: "api-token", width: "w-full" },
	{ hint: false, id: "project-key", width: "w-full" },
	{ hint: false, id: "issue-type", width: "w-full" },
	{ hint: true, id: "webhook-secret", width: "w-full" },
];

const SKELETON_ACTIONS: readonly SettingsSkeletonAction[] = [
	{ id: "test-connection", width: "w-20" },
	{ id: "save", width: "w-12" },
];

function JiraConfigFormView({
	projectId,
	state,
}: {
	projectId: string;
	state: JiraConfigState;
}) {
	const form = useJiraConfigForm(projectId, state);
	const handlers = useFieldHandlers(form.patch);
	const { errors, submitted, values } = form;

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			{state.credentialProblem === null ? null : (
				<CredentialProblemNotice reason={state.credentialProblem} />
			)}
			<JiraConfigFields
				errors={errors}
				handlers={handlers}
				onToggleClear={form.toggleClearWebhookSecret}
				pending={form.pending}
				state={state}
				submitted={submitted}
				values={values}
			/>
			{form.testResult === null ? null : (
				<JiraConnectionResult result={form.testResult} />
			)}
			<JiraConfigFormActions
				onTest={form.handleTest}
				pending={form.pending}
				testPending={form.testPending}
			/>
		</form>
	);
}

function JiraSettingsBody({ projectId }: { projectId: string }) {
	const configQuery = useQuery(
		orpc.jira.getConfig.queryOptions({ input: { projectId } })
	);
	const { refetch } = configQuery;
	const handleRetry = useCallback(() => {
		refetch();
	}, [refetch]);

	if (configQuery.isPending) {
		return (
			<SettingsFieldsSkeleton
				actions={SKELETON_ACTIONS}
				fields={SKELETON_FIELDS}
			/>
		);
	}
	if (configQuery.data === undefined) {
		return <SettingsSectionError onRetry={handleRetry} />;
	}
	return <JiraConfigFormView projectId={projectId} state={configQuery.data} />;
}

export function JiraSettingsSection({ projectId }: { projectId: string }) {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<JiraSettingsBody projectId={projectId} />
		</SettingsSection>
	);
}
