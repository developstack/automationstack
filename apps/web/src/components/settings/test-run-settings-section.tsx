/**
 * 「测试任务」分区：完成后多少天自动提交并锁定。
 *
 * 这一页唯一一个纯标量偏好，落在 `project_settings` 表上（懒创建，见
 * plan §3.3）。它与 Jira 分区分开保存，互不阻塞。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
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
} from "@/components/settings/settings-section";
import { orpc } from "@/utils/orpc";

const HEADING_ID = "settings-test-run-heading";
const FIELD_ID = "settings-auto-submit-days";
const HINT_ID = "settings-auto-submit-days-hint";
const ERROR_ID = "settings-auto-submit-days-error";

/*
 * 用模块名「测试评审和执行」而不是记录名「测试任务」：这一节配的是整个模块的
 * 行为（自动提交等待天数），不是某一个测试任务的属性。设置页的小标题要跟侧栏
 * 一级导航对得上，用户才知道自己在配哪一块。
 */
const SECTION_TITLE = "测试评审和执行";
const SECTION_DESCRIPTION =
	"测试任务完成后超过该天数仍未手动提交，将自动提交并锁定。";

/** 骨架里要占位的字段数：这一节只有「天数」一格。 */
const FIELD_COUNT = 1;

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
			const result = validateAutoSubmitDays(raw);
			if (result.kind !== "ok") {
				return;
			}
			save.mutate({
				autoSubmitAfterCompletedDays: result.days,
				projectId,
			});
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
			<div className="flex flex-col gap-2">
				<Label htmlFor={FIELD_ID}>自动提交等待天数</Label>
				<div className="flex items-center gap-2">
					<Input
						aria-describedby={
							error === null ? HINT_ID : `${ERROR_ID} ${HINT_ID}`
						}
						aria-invalid={error !== null}
						className="w-28"
						disabled={save.isPending}
						id={FIELD_ID}
						// 数字键盘：手机上默认弹出的全键盘要多两步才够得着数字
						inputMode="numeric"
						max={MAX_AUTO_SUBMIT_DAYS}
						min={MIN_AUTO_SUBMIT_DAYS}
						onChange={handleChange}
						step={1}
						type="number"
						value={raw}
					/>
					{/* 单位不放进 Label：读屏念字段名时不该带上量纲，它属于值 */}
					<span aria-hidden="true" className="text-muted-foreground text-sm">
						天
					</span>
				</div>
				{error === null ? null : (
					<p className="text-destructive text-xs" id={ERROR_ID}>
						{error}
					</p>
				)}
				<p className="text-muted-foreground text-xs" id={HINT_ID}>
					{hintText(settings)}
				</p>
			</div>
			<div className="flex justify-end">
				<Button disabled={save.isPending} type="submit">
					{save.isPending ? "保存中…" : "保存"}
				</Button>
			</div>
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
		return <SettingsFieldsSkeleton fields={FIELD_COUNT} />;
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
