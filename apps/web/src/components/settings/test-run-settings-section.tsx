/**
 * 「测试任务」分区：完成后多少天自动提交并锁定。
 *
 * 这一页唯一一个纯标量偏好，落在 `project_settings` 表上（懒创建，见
 * plan §3.3）。它与 Jira 分区分开保存，互不阻塞。
 */
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
	SettingsSection,
	SettingsSectionError,
	type SettingsSkeletonAction,
	type SettingsSkeletonField,
} from "@/components/settings/settings-section";
import { TestRunSettingsFields } from "@/components/settings/test-run-settings-fields";
import { orpc } from "@/utils/orpc";

const HEADING_ID = "settings-test-run-heading";

/*
 * 用模块名「测试评审和执行」而不是记录名「测试任务」：这一节配的是整个模块的
 * 行为（自动提交等待天数），不是某一个测试任务的属性。设置页的小标题要跟侧栏
 * 一级导航对得上，用户才知道自己在配哪一块。
 */
const SECTION_TITLE = "测试评审和执行";
const SECTION_DESCRIPTION =
	"测试任务完成后超过该天数仍未手动提交，将自动提交并锁定。";

/**
 * 骨架逐项对着 test-run-settings-fields.tsx 的真身填，不是「一格满宽输入框」：
 * 那一格的 `<Input className="w-28">` 只有 112px，画成 w-full 的话数据到达那一帧
 * 输入框会从整条面板宽度（这一格是 max-w-3xl）当场塌回 112px；它底下还有一行
 * hint（`<p className="text-muted-foreground text-xs" id={HINT_ID}>`），漏掉的话
 * 这一节会凭空长高 24px，把下面的提交行一起顶下去。
 */
const SKELETON_FIELDS: readonly SettingsSkeletonField[] = [
	{ hint: true, id: "auto-submit-days", width: "w-28" },
];

/**
 * 提交行只有「保存」一颗（真身在 TestRunSettingsFields 末尾的
 * `<div className="flex justify-end">`）。宽度按 Button default 档折算：
 * 两个汉字 text-sm = 28px + px-2.5 两侧 20px ≈ 48px = w-12。
 */
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
			// 失败不抑制全局 toast：服务端 zod 越界那句话本身就是用户要看的
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

/**
 * 说明文案随 `configured` 分岔。
 *
 * 服务端刻意把「没有设置行」也返回成完整对象 + `configured: false`，就是为了
 * 让这里能区分「有人显式选了 3 天」和「从没人管过、正在吃兜底默认」。
 * 两者在输入框里长得一模一样，只有这句话能说清楚。
 */
function hintText(settings: ProjectSettingsData): string {
	if (settings.configured) {
		return `本项目已保存过设置。范围 ${MIN_AUTO_SUBMIT_DAYS}–${MAX_AUTO_SUBMIT_DAYS} 天。`;
	}
	return `本项目从未保存过设置，当前使用默认值 ${settings.autoSubmitAfterCompletedDays} 天。范围 ${MIN_AUTO_SUBMIT_DAYS}–${MAX_AUTO_SUBMIT_DAYS} 天。`;
}

/**
 * 提交前再校验一次，不合法就不给载荷。
 *
 * 之所以要在 handleSubmit 里重跑一遍而不是复用渲染时算好的那份：渲染那份是
 * 给「该不该标红」用的，它受 `submitted` 影响；能不能发请求只取决于当前输入
 * 本身，两条判断混用一份结果，第一次提交就会因为 `submitted` 还是 false 而
 * 把一个非法值放过去。
 */
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
	/*
	 * 初值只在挂载那一次取（调用方按 projectId 给了 key，换项目会整块重挂），
	 * 之后不跟着服务端回填：保存后重新拉到的值若倒灌进输入框，正在改的半截
	 * 内容就被冲掉了。与 use-provider-config-form.ts 同一条约定。
	 *
	 * 值按字符串管：转成数字之后「删空重填」的中间态会被折成 0 写回框里。
	 */
	const [raw, setRaw] = useState(() =>
		String(settings.autoSubmitAfterCompletedDays)
	);
	// 提交过一次之后才标红：一进页面就指责用户还没填错的东西
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
		// noValidate：原生校验气泡是英文的，跟这里的中文内联提示对不上
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
	// isPending 落下来还没有数据 = 这条查询失败了（全局 toast 已经报过一次）
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
