/**
 * 「Jira 集成」分区。
 *
 * **未配置是绝大多数项目的正常状态**（plan §5.1 / D9）：这一节此时展示一张
 * 空表单，不报错、不出现异常态、也不影响页面其它任何部分。服务端为此把
 * 「没配」与「配了但解不开」在类型上分成了两件事，这里照着分开渲染——
 * 把前者也画成红条，等于告诉每一个没接 Jira 的团队他们坏了。
 *
 * 六格字段本身在 `jira-config-fields.tsx`；留在这里的是表单的骨架与它的
 * 两个 hook 调用。两个 hook 必须在这一层、按这个顺序调用：`useFieldHandlers`
 * 吃的是 `useJiraConfigForm` 给出的 `patch`，把它们中的任何一个挪进子组件，
 * 表单实例就会跟着子树的挂载/卸载走，正在输入的内容会在重挂时整份丢掉。
 */
import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { CredentialProblemNotice } from "@/components/settings/credential-problem-notice";
import { JiraConfigFields } from "@/components/settings/jira-config-fields";
import { JiraConfigFormActions } from "@/components/settings/jira-config-form-actions";
import { JiraConnectionResult } from "@/components/settings/jira-connection-result";
import { useFieldHandlers } from "@/components/settings/jira-field-group";
import {
	SettingsFieldsSkeleton,
	type SettingsSkeletonAction,
	type SettingsSkeletonField,
} from "@/components/settings/settings-fields-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { SettingsSectionError } from "@/components/settings/settings-section-error";
import { useJiraConfigForm } from "@/components/settings/use-jira-config-form";
import { orpc } from "@/utils/orpc";

const HEADING_ID = "settings-jira-heading";
const SECTION_TITLE = "Jira 集成";
const SECTION_DESCRIPTION =
	"配置后，失败用例可一键建 issue、粘贴链接反向关联，并由 webhook 同步 issue 状态。未配置也不影响测试任务的任何功能。";

/**
 * 骨架逐项对着 jira-config-fields.tsx 的 `JiraConfigFields` 填。
 *
 * **六格，不是五格**：站点 URL / 邮箱 / API Token / project key / 默认 issue
 * 类型 / Webhook 密钥。原先漏的是最后那格密钥——它在 `JiraWebhookFields` 里，
 * 数错的代价是数据到达那一帧表单凭空长出一格（54px 起）。
 *
 * 第七格「Webhook 地址」（`JiraWebhookUrl`）刻意不画：它只在库里已经存过配置
 * 时才渲染（`config === null` 时整块不出），而「未配置」是绝大多数项目的常态
 * （见文件头）。按常态的六格画，已配置的项目会在数据到达时往下补一格；反过来
 * 画七格则是每一个没接 Jira 的项目都要往上塌一格。
 *
 * hint 只有两个密文格有：`JiraTextField` 底下只有一个「有错才渲染」的错误行，
 * 没有说明行；四格都跟着画说明，表单会白高 96px（4 × 24px）。
 */
const SKELETON_FIELDS: readonly SettingsSkeletonField[] = [
	{ hint: false, id: "site-url", width: "w-full" },
	{ hint: false, id: "email", width: "w-full" },
	{ hint: true, id: "api-token", width: "w-full" },
	{ hint: false, id: "project-key", width: "w-full" },
	{ hint: false, id: "issue-type", width: "w-full" },
	{ hint: true, id: "webhook-secret", width: "w-full" },
];

/**
 * 提交行是**两颗**按钮，见 jira-config-form-actions.tsx。宽度按 Button
 * default 档折算（汉字 text-sm 14px + px-2.5 两侧 20px）：
 * 「测试连接」4 字 = 76px，取最近的标准档 w-20（80px，横向差 4px，且这一行是
 * 右对齐的，差值只落在占位块的左缘）；「保存」2 字 = 48px = w-12。
 */
const SKELETON_ACTIONS: readonly SettingsSkeletonAction[] = [
	{ id: "test-connection", width: "w-20" },
	{ id: "save", width: "w-12" },
];

function JiraConfigFormView({
	projectId,
	state,
}: {
	projectId: string;
	state: JiraConfigState;
}) {
	const form = useJiraConfigForm(projectId, state);
	const handlers = useFieldHandlers(form.patch);
	const { errors, submitted, values } = form;

	return (
		// noValidate：原生校验气泡是英文的，跟这里的中文内联提示对不上
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			{state.credentialProblem === null ? null : (
				<CredentialProblemNotice reason={state.credentialProblem} />
			)}
			<JiraConfigFields
				errors={errors}
				handlers={handlers}
				onToggleClear={form.toggleClearWebhookSecret}
				pending={form.pending}
				state={state}
				submitted={submitted}
				values={values}
			/>
			{form.testResult === null ? null : (
				<JiraConnectionResult result={form.testResult} />
			)}
			<JiraConfigFormActions
				onTest={form.handleTest}
				pending={form.pending}
				testPending={form.testPending}
			/>
		</form>
	);
}

function JiraSettingsBody({ projectId }: { projectId: string }) {
	const configQuery = useQuery(
		orpc.jira.getConfig.queryOptions({ input: { projectId } })
	);
	const { refetch } = configQuery;
	const handleRetry = useCallback(() => {
		refetch();
	}, [refetch]);

	if (configQuery.isPending) {
		return (
			<SettingsFieldsSkeleton
				actions={SKELETON_ACTIONS}
				fields={SKELETON_FIELDS}
			/>
		);
	}
	// isPending 落下来还没有数据 = 这条查询失败了（全局 toast 已经报过一次）
	if (configQuery.data === undefined) {
		return <SettingsSectionError onRetry={handleRetry} />;
	}
	return <JiraConfigFormView projectId={projectId} state={configQuery.data} />;
}

export function JiraSettingsSection({ projectId }: { projectId: string }) {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<JiraSettingsBody projectId={projectId} />
		</SettingsSection>
	);
}
