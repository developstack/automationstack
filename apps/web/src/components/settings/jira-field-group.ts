import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { useCallback } from "react";

import type {
	JiraFieldErrors,
	JiraFormValues,
} from "@/components/settings/jira-form-values";

export function useFieldHandlers(
	patch: (next: Partial<JiraFormValues>) => void
) {
	return {
		apiToken: useCallback((apiToken: string) => patch({ apiToken }), [patch]),
		defaultIssueType: useCallback(
			(defaultIssueType: string) => patch({ defaultIssueType }),
			[patch]
		),
		email: useCallback((email: string) => patch({ email }), [patch]),
		projectKey: useCallback(
			(projectKey: string) => patch({ projectKey }),
			[patch]
		),
		siteUrl: useCallback((siteUrl: string) => patch({ siteUrl }), [patch]),
		webhookSecret: useCallback(
			(webhookSecret: string) => patch({ webhookSecret }),
			[patch]
		),
	};
}

export type JiraFieldHandlers = ReturnType<typeof useFieldHandlers>;

export interface JiraFieldGroupProps {
	errors: JiraFieldErrors;
	handlers: JiraFieldHandlers;
	onToggleClear: () => void;
	pending: boolean;
	state: JiraConfigState;
	submitted: boolean;
	values: JiraFormValues;
}

export function shown(
	submitted: boolean,
	message: string | null
): string | null {
	return submitted ? message : null;
}
