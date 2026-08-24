/**
 * 缺陷关联（plan §7.3 / D9）。
 *
 * 有两套完全不同的形态，**由后端 `jira.getConfig` 的结果决定走哪套**，
 * 不靠 try/catch 兜：
 *
 * - 已配置：一键创建 issue、粘贴 key/URL 反向关联、显示 Jira 侧的状态；
 * - 未配置：退化成一个纯文本 URL 输入框（`linkDefect` 在未配置时不发任何
 *   外部请求，把输入原样存进 `defectUrl`）。
 *
 * 降级形态**不能报错、不能出现异常 UI、更不能挡住打结论**——绝大多数项目
 * 不会接 Jira，那条路径才是常态。所以配置查询本身失败或还在加载时，
 * 一律先按未配置渲染：让人先能填个链接，比让人对着一个 spinner 干等强。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BugIcon, ExternalLinkIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { isSafeHttpUrl } from "@/components/test-runs/report-meta";
import { orpc } from "@/utils/orpc";

export interface RunDefectPanelProps {
	defectKey: string | null;
	defectStatus: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
	/** 已提交：只读。 */
	locked: boolean;
	projectId: string;
	runCaseId: string;
}

function useInvalidateRuns(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.testRuns.key() });
	}, [queryClient]);
}

/** 已关联时的展示行：链接 + Jira 状态 + 解除关联。 */
function LinkedDefect({
	defectKey,
	defectStatus,
	defectTitle,
	defectUrl,
	locked,
	runCaseId,
}: Omit<RunDefectPanelProps, "projectId">) {
	const invalidate = useInvalidateRuns();
	const clear = useMutation(
		orpc.jira.clearDefect.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("已解除缺陷关联");
			},
		})
	);
	const refresh = useMutation(
		orpc.jira.refreshDefectStatus.mutationOptions({
			onSuccess: (data) => {
				invalidate();
				toast.success(
					data.status === null ? "Jira 未返回状态" : `Jira 状态：${data.status}`
				);
			},
		})
	);
	const handleClear = useCallback(
		() => clear.mutate({ runCaseId }),
		[clear, runCaseId]
	);
	const handleRefresh = useCallback(
		() => refresh.mutate({ runCaseId }),
		[refresh, runCaseId]
	);

	// 手填的 URL 是用户可控字符串，协议不在 http/https 白名单里就只当纯文本显示，
	// 不悄悄丢掉——那毕竟是有人填进去的内容。
	const linkable = isSafeHttpUrl(defectUrl);
	const label = defectKey ?? defectTitle ?? defectUrl ?? "已关联缺陷";

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
			<BugIcon aria-hidden="true" className="size-4 shrink-0" />
			{linkable && defectUrl !== null ? (
				<a
					className="min-w-0 truncate text-sm underline underline-offset-4"
					href={defectUrl}
					rel="noopener"
					target="_blank"
				>
					{label}
					<ExternalLinkIcon aria-hidden="true" className="ml-1 inline size-3" />
				</a>
			) : (
				<span className="min-w-0 truncate text-sm">{label}</span>
			)}
			{defectStatus !== null && (
				<span className="rounded border px-1.5 py-0.5 text-xs">
					{defectStatus}
				</span>
			)}
			{defectKey !== null && !locked && (
				<Button
					aria-disabled={refresh.isPending || undefined}
					aria-label="刷新 Jira 状态"
					onClick={refresh.isPending ? undefined : handleRefresh}
					size="icon"
					type="button"
					variant="ghost"
				>
					<RefreshCwIcon aria-hidden="true" />
				</Button>
			)}
			{!locked && (
				<Button
					aria-disabled={clear.isPending || undefined}
					aria-label="解除缺陷关联"
					onClick={clear.isPending ? undefined : handleClear}
					size="icon"
					type="button"
					variant="ghost"
				>
					<XIcon aria-hidden="true" />
				</Button>
			)}
		</div>
	);
}

interface LinkFormProps {
	jiraConfigured: boolean;
	runCaseId: string;
}

/** 反向关联表单。未配置 Jira 时它就是「手填缺陷链接」。 */
function LinkForm({ jiraConfigured, runCaseId }: LinkFormProps) {
	const invalidate = useInvalidateRuns();
	const [reference, setReference] = useState("");
	const link = useMutation(
		orpc.jira.linkDefect.mutationOptions({
			onSuccess: () => {
				invalidate();
				setReference("");
				toast.success("已关联缺陷");
			},
		})
	);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setReference(event.target.value),
		[]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = reference.trim();
			if (trimmed !== "") {
				link.mutate({ reference: trimmed, runCaseId });
			}
		},
		[link, reference, runCaseId]
	);

	const label = jiraConfigured ? "Jira issue 编号或链接" : "缺陷链接";
	const placeholder = jiraConfigured
		? "PAY-123 或 https://your.atlassian.net/browse/PAY-123"
		: "https://…（贴上你们缺陷系统里的链接）";

	return (
		<form className="flex items-end gap-2" onSubmit={handleSubmit}>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<label className="text-muted-foreground text-xs" htmlFor="defect-ref">
					{label}
				</label>
				<Input
					id="defect-ref"
					onChange={handleChange}
					placeholder={placeholder}
					value={reference}
				/>
			</div>
			<Button
				aria-disabled={link.isPending || reference.trim() === "" || undefined}
				type="submit"
				variant="outline"
			>
				关联
			</Button>
		</form>
	);
}

/** 已配置 Jira 时才出现的一键建单。 */
function CreateDefectButton({ runCaseId }: { runCaseId: string }) {
	const invalidate = useInvalidateRuns();
	const create = useMutation(
		orpc.jira.createDefect.mutationOptions({
			onSuccess: (view) => {
				invalidate();
				toast.success(`已创建 ${view.defectKey ?? "Jira issue"}`);
			},
		})
	);
	const handleClick = useCallback(
		() => create.mutate({ runCaseId }),
		[create, runCaseId]
	);
	return (
		<Button
			aria-disabled={create.isPending || undefined}
			onClick={create.isPending ? undefined : handleClick}
			type="button"
			variant="outline"
		>
			<BugIcon aria-hidden="true" data-icon="inline-start" />
			{create.isPending ? "创建中…" : "创建 Jira Issue"}
		</Button>
	);
}

export function RunDefectPanel({
	defectKey,
	defectStatus,
	defectTitle,
	defectUrl,
	locked,
	projectId,
	runCaseId,
}: RunDefectPanelProps) {
	const configQuery = useQuery(
		orpc.jira.getConfig.queryOptions({ input: { projectId } })
	);
	// 加载中 / 查询失败一律当成未配置：降级形态是完全可用的，
	// 而「等一下再告诉你能不能建单」会把打结论的流程卡住。
	const state = configQuery.data ?? null;
	// 先把 state 拆开再比：`state?.config !== null` 在 state 本身为 null 时
	// 得到的是 undefined !== null，也就是 true，会把「还没查到」当成「已配置」。
	const jiraConfig = state === null ? null : state.config;
	const credentialProblem = state === null ? null : state.credentialProblem;
	const jiraConfigured = jiraConfig !== null && credentialProblem === null;
	// 「配了但凭据用不了」与「压根没配」是两回事，文案要分开。
	const credentialBroken = jiraConfig !== null && credentialProblem !== null;
	const linked = defectUrl !== null || defectKey !== null;

	return (
		<section className="flex flex-col gap-2">
			<h3 className="font-medium text-sm">缺陷</h3>
			{linked ? (
				<LinkedDefect
					defectKey={defectKey}
					defectStatus={defectStatus}
					defectTitle={defectTitle}
					defectUrl={defectUrl}
					locked={locked}
					runCaseId={runCaseId}
				/>
			) : null}
			{linked || locked ? null : (
				<div className="flex flex-col gap-2">
					{jiraConfigured ? <CreateDefectButton runCaseId={runCaseId} /> : null}
					<LinkForm jiraConfigured={jiraConfigured} runCaseId={runCaseId} />
					{credentialBroken ? (
						// 前者要管理员去重填 Token，混为一谈会让人以为配置丢了。
						// 这时仍可手工填链接，打结论的流程一步都不受影响。
						<p className="text-muted-foreground text-xs">
							本项目的 Jira 凭据当前不可用，暂时无法自动建单；可以先手工填链接。
						</p>
					) : null}
				</div>
			)}
			{locked && !linked ? (
				<p className="text-muted-foreground text-sm">未关联缺陷。</p>
			) : null}
		</section>
	);
}
