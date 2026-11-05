import { createFileRoute } from "@tanstack/react-router";

import { StorageSettingsPage } from "@/components/storage-settings/storage-settings-page";
import {
	StorageSettingsPending,
	StorageSettingsShell,
} from "@/components/storage-settings/storage-settings-shell";

export const Route = createFileRoute("/settings/storage")({
	component: StorageSettingsRoute,
	head: () => ({ meta: [{ title: "存储设置 · 测试用例平台" }] }),
	loader: async ({ context }) => {
		const user = await context.queryClient.ensureQueryData(
			context.orpc.auth.me.queryOptions()
		);
		if (user?.role === "admin") {
			await context.queryClient.ensureQueryData(
				context.orpc.storageSettings.get.queryOptions()
			);
		}
	},
	pendingComponent: StorageSettingsPending,
});

function StorageSettingsRoute() {
	return (
		<StorageSettingsShell phase="ready">
			<StorageSettingsPage />
		</StorageSettingsShell>
	);
}
