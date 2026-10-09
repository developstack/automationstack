import {
	SettingsFieldsSkeleton,
	type SettingsSkeletonAction,
	type SettingsSkeletonField,
} from "@/components/settings/settings-fields-skeleton";

const SKELETON_FIELDS: readonly SettingsSkeletonField[] = [
	{ hint: true, id: "status", width: "w-full" },
	{ hint: true, id: "provider", width: "w-1/2" },
	{ hint: false, id: "issuer", width: "w-full" },
	{ hint: true, id: "internal-url", width: "w-full" },
	{ hint: false, id: "organization", width: "w-full" },
	{ hint: false, id: "client-id", width: "w-full" },
	{ hint: true, id: "client-secret", width: "w-full" },
];

const SKELETON_ACTIONS: readonly SettingsSkeletonAction[] = [
	{ id: "save", width: "w-12" },
];

export function AuthSettingsSkeleton() {
	return (
		<SettingsFieldsSkeleton
			actions={SKELETON_ACTIONS}
			fields={SKELETON_FIELDS}
		/>
	);
}
