import { AuthSettingsShell } from "@/components/auth-settings/auth-settings-shell";
import { AuthSettingsSkeleton } from "@/components/auth-settings/auth-settings-skeleton";

export function AuthSettingsPending() {
	return (
		<AuthSettingsShell phase="pending">
			<AuthSettingsSkeleton />
		</AuthSettingsShell>
	);
}
