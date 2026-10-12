import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { useCallback } from "react";

import type {
	AuthProviderValue,
	AuthSettingsFieldErrors,
	AuthSettingsFormValues,
} from "@/components/auth-settings/auth-settings-form-values";

type Patch = (next: Partial<AuthSettingsFormValues>) => void;

export function useAuthFieldHandlers(patch: Patch) {
	return {
		adminRole: useCallback(
			(adminRole: string) => patch({ adminRole }),
			[patch]
		),
		clientId: useCallback((clientId: string) => patch({ clientId }), [patch]),
		clientSecret: useCallback(
			(clientSecret: string) => patch({ clientSecret }),
			[patch]
		),
		issuer: useCallback((issuer: string) => patch({ issuer }), [patch]),
		organization: useCallback(
			(organization: string) => patch({ organization }),
			[patch]
		),
		projectAdminRole: useCallback(
			(projectAdminRole: string) => patch({ projectAdminRole }),
			[patch]
		),
		provider: useCallback(
			(provider: AuthProviderValue) => patch({ provider }),
			[patch]
		),
		redirectUrl: useCallback(
			(redirectUrl: string) => patch({ redirectUrl }),
			[patch]
		),
		webhookSecret: useCallback(
			(webhookSecret: string) => patch({ webhookSecret }),
			[patch]
		),
	};
}

export type AuthFieldHandlers = ReturnType<typeof useAuthFieldHandlers>;

export interface AuthSettingsFieldGroupProps {
	/** 提交过一次后才显示的字段错误。 */
	errors: AuthSettingsFieldErrors;
	handlers: AuthFieldHandlers;
	pending: boolean;
	values: AuthSettingsFormValues;
	view: AuthSettingsView;
}
