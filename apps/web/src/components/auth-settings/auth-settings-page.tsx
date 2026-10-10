import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "@/components/auth/use-session";
import { AuthSettingsForbidden } from "@/components/auth-settings/auth-settings-forbidden";
import { AuthSettingsForm } from "@/components/auth-settings/auth-settings-form";
import { AuthSettingsSkeleton } from "@/components/auth-settings/auth-settings-skeleton";
import { SettingsSectionError } from "@/components/settings/settings-section-error";
import { orpc } from "@/utils/orpc";

function AuthSettingsBody() {
	const query = useQuery(orpc.authSettings.get.queryOptions());
	const { refetch } = query;
	const handleRetry = useCallback(() => {
		refetch();
	}, [refetch]);

	if (query.isPending) {
		return <AuthSettingsSkeleton />;
	}
	if (query.data === undefined) {
		return <SettingsSectionError onRetry={handleRetry} />;
	}
	return <AuthSettingsForm view={query.data} />;
}

export function AuthSettingsPage() {
	const { isPending, user } = useSession();

	if (isPending) {
		return <AuthSettingsSkeleton />;
	}
	if (user?.role !== "admin") {
		return <AuthSettingsForbidden />;
	}
	return <AuthSettingsBody />;
}
