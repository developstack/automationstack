import {
	SettingsFieldsSkeleton,
	type SettingsSkeletonAction,
	type SettingsSkeletonField,
} from "@/components/settings/settings-fields-skeleton";

const SKELETON_FIELDS: readonly SettingsSkeletonField[] = [
	{ hint: true, id: "status", width: "w-full" },
	{ hint: true, id: "backend", width: "w-1/2" },
];

const SKELETON_ACTIONS: readonly SettingsSkeletonAction[] = [
	{ id: "save", width: "w-12" },
];

export function StorageSettingsSkeleton() {
	return (
		<SettingsFieldsSkeleton
			actions={SKELETON_ACTIONS}
			fields={SKELETON_FIELDS}
		/>
	);
}
