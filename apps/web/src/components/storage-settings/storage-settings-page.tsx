import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import { useSession } from "@/components/auth/use-session";
import { SettingsSectionError } from "@/components/settings/settings-section-error";
import { StorageSettingsForm } from "@/components/storage-settings/storage-settings-form";
import { StorageSettingsSkeleton } from "@/components/storage-settings/storage-settings-skeleton";
import { orpc } from "@/utils/orpc";

function StorageSettingsForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要平台管理员权限</EmptyTitle>
				<EmptyDescription>
					存储设置只对平台管理员开放。可以回到
					<Link className="underline underline-offset-4" to="/projects">
						项目列表
					</Link>
					。
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function StorageSettingsBody() {
	const query = useQuery(orpc.storageSettings.get.queryOptions());
	const { refetch } = query;
	const handleRetry = useCallback(() => {
		refetch();
	}, [refetch]);

	if (query.isPending) {
		return <StorageSettingsSkeleton />;
	}
	if (query.data === undefined) {
		return <SettingsSectionError onRetry={handleRetry} />;
	}
	return <StorageSettingsForm view={query.data} />;
}

export function StorageSettingsPage() {
	const { isPending, user } = useSession();

	if (isPending) {
		return <StorageSettingsSkeleton />;
	}
	if (user?.role !== "admin") {
		return <StorageSettingsForbidden />;
	}
	return <StorageSettingsBody />;
}
