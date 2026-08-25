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
 *
 * 这个文件只做那个「走哪套」的判断与编排：已关联的展示行在
 * `run-defect-linked.tsx`，未关联时的入口在 `run-defect-link-form.tsx`，
 * 三条写路径在 `run-defect-mutations.ts`。
 */
import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { useQuery } from "@tanstack/react-query";

import { DefectLinkActions } from "@/components/test-runs/run-defect-link-form";
import { LinkedDefect } from "@/components/test-runs/run-defect-linked";
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

interface JiraAvailability {
	/** 能不能一键建单。 */
	configured: boolean;
	credentialBroken: boolean;
}

/**
 * 把 `getConfig` 的结果压成这一页真正关心的两个布尔。
 *
 * 加载中 / 查询失败一律当成未配置：降级形态是完全可用的，
 * 而「等一下再告诉你能不能建单」会把打结论的流程卡住。
 */
function readJiraAvailability(
	data: JiraConfigState | undefined
): JiraAvailability {
	const state = data ?? null;
	// 先把 state 拆开再比：`state?.config !== null` 在 state 本身为 null 时
	// 得到的是 undefined !== null，也就是 true，会把「还没查到」当成「已配置」。
	const config = state === null ? null : state.config;
	const credentialProblem = state === null ? null : state.credentialProblem;
	return {
		configured: config !== null && credentialProblem === null,
		// 「配了但凭据用不了」与「压根没配」是两回事，文案要分开。
		credentialBroken: config !== null && credentialProblem !== null,
	};
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
	const jira = readJiraAvailability(configQuery.data);
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
				<DefectLinkActions
					credentialBroken={jira.credentialBroken}
					jiraConfigured={jira.configured}
					runCaseId={runCaseId}
				/>
			)}
			{locked && !linked ? (
				<p className="text-muted-foreground text-sm">未关联缺陷。</p>
			) : null}
		</section>
	);
}
