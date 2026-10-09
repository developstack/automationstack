import { createFileRoute } from "@tanstack/react-router";

import { AuthSettingsPage } from "@/components/auth-settings/auth-settings-page";
import { AuthSettingsPending } from "@/components/auth-settings/auth-settings-pending";
import { AuthSettingsShell } from "@/components/auth-settings/auth-settings-shell";

export const Route = createFileRoute("/settings/auth")({
	component: AuthSettingsRoute,
	head: () => ({ meta: [{ title: "认证设置 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.authSettings.get.queryOptions()
			);
		}
	},
	pendingComponent: AuthSettingsPending,
});

function AuthSettingsRoute() {
	return (
		<AuthSettingsShell phase="ready">
			<AuthSettingsPage />
		</AuthSettingsShell>
	);
}
