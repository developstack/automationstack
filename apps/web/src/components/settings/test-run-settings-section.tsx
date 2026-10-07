import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	MAX_AUTO_SUBMIT_DAYS,
	MIN_AUTO_SUBMIT_DAYS,
	validateAutoSubmitDays,
} from "@/components/settings/auto-submit-days";
import {
	SettingsFieldsSkeleton,
	type SettingsSkeletonAction,
	type SettingsSkeletonField,
} from "@/components/settings/settings-fields-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { SettingsSectionError } from "@/components/settings/settings-section-error";
import { TestRunSettingsFields } from "@/components/settings/test-run-settings-fields";
import { orpc } from "@/utils/orpc";

const HEADING_ID = "settings-test-run-heading";

const SECTION_TITLE = "测试评审和执行";
const SECTION_DESCRIPTION =
	"测试任务完成后超过该天数仍未手动提交，将自动提交并锁定。";

const SKELETON_FIELDS: readonly SettingsSkeletonField[] = [
	{ hint: true, id: "auto-submit-days", width: "w-28" },
];

const SKELETON_ACTIONS: readonly SettingsSkeletonAction[] = [
	{ id: "save", width: "w-12" },
];

interface ProjectSettingsData {
	autoSubmitAfterCompletedDays: number;
	configured: boolean;
}

function useSaveSettings(projectId: string) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.projectSettings.update.mutationOptions({
			onSuccess: (settings: { autoSubmitAfterCompletedDays: number }) => {
				queryClient.invalidateQueries({
					queryKey: orpc.projectSettings.get.key({ input: { projectId } }),
				});
				toast.success(
					`已保存：完成后 ${settings.autoSubmitAfterCompletedDays} 天自动提交`
				);
			},
		})
	);
}

function hintText(settings: ProjectSettingsData): string {
	if (settings.configured) {
		return `本项目已保存过设置。范围 ${MIN_AUTO_SUBMIT_DAYS}–${MAX_AUTO_SUBMIT_DAYS} 天。`;
	}
	return `本项目从未保存过设置，当前使用默认值 ${settings.autoSubmitAfterCompletedDays} 天。范围 ${MIN_AUTO_SUBMIT_DAYS}–${MAX_AUTO_SUBMIT_DAYS} 天。`;
}

function autoSubmitPayload(raw: string, projectId: string) {
	const result = validateAutoSubmitDays(raw);
	if (result.kind !== "ok") {
		return null;
	}
	return { autoSubmitAfterCompletedDays: result.days, projectId };
}

function TestRunSettingsForm({
	projectId,
	settings,
}: {
	projectId: string;
	settings: ProjectSettingsData;
}) {
	const [raw, setRaw] = useState(() =>
		String(settings.autoSubmitAfterCompletedDays)
	);
	const [submitted, setSubmitted] = useState(false);
	const save = useSaveSettings(projectId);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setRaw(event.target.value),
		[]
	);

	const validated = validateAutoSubmitDays(raw);
	const error =
		submitted && validated.kind === "invalid" ? validated.message : null;

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			const payload = autoSubmitPayload(raw, projectId);
			if (payload !== null) {
				save.mutate(payload);
			}
		},
		[projectId, raw, save]
	);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={handleSubmit}
		>
			<TestRunSettingsFields
				error={error}
				hint={hintText(settings)}
				onChange={handleChange}
				pending={save.isPending}
				value={raw}
			/>
		</form>
	);
}

function TestRunSettingsBody({ projectId }: { projectId: string }) {
	const settingsQuery = useQuery(
		orpc.projectSettings.get.queryOptions({ input: { projectId } })
	);
	const { refetch } = settingsQuery;
	const handleRetry = useCallback(() => {
		refetch();
	}, [refetch]);

	if (settingsQuery.isPending) {
		return (
			<SettingsFieldsSkeleton
				actions={SKELETON_ACTIONS}
				fields={SKELETON_FIELDS}
			/>
		);
	}
	if (settingsQuery.data === undefined) {
		return <SettingsSectionError onRetry={handleRetry} />;
	}
	return (
		<TestRunSettingsForm projectId={projectId} settings={settingsQuery.data} />
	);
}

export function TestRunSettingsSection({ projectId }: { projectId: string }) {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<TestRunSettingsBody projectId={projectId} />
		</SettingsSection>
	);
}
