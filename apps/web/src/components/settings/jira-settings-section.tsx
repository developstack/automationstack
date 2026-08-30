/**
 * 「Jira 集成」分区。
 *
 * **未配置是绝大多数项目的正常状态**（plan §5.1 / D9）：这一节此时展示一张
 * 空表单，不报错、不出现异常态、也不影响页面其它任何部分。服务端为此把
 * 「没配」与「配了但解不开」在类型上分成了两件事，这里照着分开渲染——
 * 把前者也画成红条，等于告诉每一个没接 Jira 的团队他们坏了。
 *
 * 六格字段本身在 `jira-settings-fields.tsx`；留在这里的是表单的骨架与它的
 * 两个 hook 调用。两个 hook 必须在这一层、按这个顺序调用：`useFieldHandlers`
 * 吃的是 `useJiraConfigForm` 给出的 `patch`，把它们中的任何一个挪进子组件，
 * 表单实例就会跟着子树的挂载/卸载走，正在输入的内容会在重挂时整份丢掉。
 */
import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { Button } from "@automationstack/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import { JiraConnectionResult } from "@/components/settings/jira-connection-result";
import {
	JiraConfigFields,
	useFieldHandlers,
} from "@/components/settings/jira-settings-fields";
import {
	SettingsFieldsSkeleton,
	SettingsSection,
	SettingsSectionError,
	type SettingsSkeletonAction,
	type SettingsSkeletonField,
} from "@/components/settings/settings-section";
import { useJiraConfigForm } from "@/components/settings/use-jira-config-form";
import { orpc } from "@/utils/orpc";

const HEADING_ID = "settings-jira-heading";
const SECTION_TITLE = "Jira 集成";
const SECTION_DESCRIPTION =
	"配置后，失败用例可一键建 issue、粘贴链接反向关联，并由 webhook 同步 issue 状态。未配置也不影响测试任务的任何功能。";

/**
 * 骨架逐项对着 jira-settings-fields.tsx 的 `JiraConfigFields` 填。
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
 * 提交行是**两颗**按钮，见下面的 `JiraConfigFormActions`。宽度按 Button
 * default 档折算（汉字 text-sm 14px + px-2.5 两侧 20px）：
 * 「测试连接」4 字 = 76px，取最近的标准档 w-20（80px，横向差 4px，且这一行是
 * 右对齐的，差值只落在占位块的左缘）；「保存」2 字 = 48px = w-12。
 */
const SKELETON_ACTIONS: readonly SettingsSkeletonAction[] = [
	{ id: "test-connection", width: "w-20" },
	{ id: "save", width: "w-12" },
];

function CredentialProblemNotice({ reason }: { reason: string }) {
	const detail =
		reason === "master-key-missing"
			? "服务端未配置 SECRET_ENCRYPTION_KEY，已存的 API Token 解不开。补上该环境变量后即可恢复，数据没有损坏。"
			: "已存的 API Token 解不开——主密钥被换过了，旧密文找不回来。请重新填写一次 API Token 并保存。";

	return (
		// role="status" 而不是 alert：它一进页面就在那儿，不是刚刚发生的事
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="status"
		>
			{/*
			 * 不加 mt-0.5：外层是 text-xs（行高 16px），图标 size-4 也是 16px，
			 * items-start 下两个盒子本来就顶齐；那 2px 是净错位，不是补偿。
			 */}
			<TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
			<div className="flex flex-col gap-1">
				<p className="font-medium">当前 Jira 凭据不可用</p>
				<p>{detail}</p>
			</div>
		</div>
	);
}

/**
 * 「测试连接」与「保存」并排在表单末尾。
 *
 * 两颗按钮的禁用条件不对称，是有意的：保存进行中连测试也一并禁掉，因为保存
 * 改的正是自检要读的那份配置，此时再发一次自检，回来的结果说的是改之前还是
 * 改之后都讲不清；反过来自检是只读的，测试进行中不挡保存。
 */
function JiraConfigFormActions({
	onTest,
	pending,
	testPending,
}: {
	onTest: () => void;
	pending: boolean;
	testPending: boolean;
}) {
	return (
		<div className="flex justify-end gap-2">
			<Button
				disabled={pending || testPending}
				onClick={onTest}
				type="button"
				variant="outline"
			>
				{testPending ? "测试中…" : "测试连接"}
			</Button>
			<Button disabled={pending} type="submit">
				{pending ? "保存中…" : "保存"}
			</Button>
		</div>
	);
}

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
