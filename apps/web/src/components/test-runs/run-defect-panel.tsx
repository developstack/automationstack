/**
 * 缺陷关联（plan §7.3 / D9）：结果页面上只有一条链接，修改页面上才有输入框。
 *
 * ## 没有「缺陷」这个小标题
 *
 * 用户原话：「缺陷这个标题去掉，只有缺陷链接，结果页面有才显示没有不显示，
 * 修改页面显示输入框让人输入，这个要放在执行结论里面。」所以这一块现在是执行结论
 * 面板里的一行，不再是一个带 `<h3>` 的独立段落；没关联缺陷时结果页面上**整块不
 * 渲染**（原先那句「未关联缺陷。」也一并删了——它正是「没有也显示」的那种东西）。
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
	/**
	 * 修改页面才给输入框与解除关联。`editing` 已经蕴含「这个任务能改」
	 * （`useVerdictEditingMode` 的一票否决），所以不再另收一个 `locked`。
	 */
	editing: boolean;
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
	editing,
	projectId,
	runCaseId,
}: RunDefectPanelProps) {
	// 查询无条件发出：hooks 不能写在提前 return 后面，而这条查询本身很便宜
	// （同一个 projectId 全页共用一份缓存）。
	const configQuery = useQuery(
		orpc.jira.getConfig.queryOptions({ input: { projectId } })
	);
	const jira = readJiraAvailability(configQuery.data);
	const linked = defectUrl !== null || defectKey !== null;

	// 结果页面上没关联缺陷：整块消失，不留标题也不留「未关联缺陷。」。
	if (!(editing || linked)) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			{linked ? (
				<LinkedDefect
					defectKey={defectKey}
					defectStatus={defectStatus}
					defectTitle={defectTitle}
					defectUrl={defectUrl}
					editing={editing}
					runCaseId={runCaseId}
				/>
			) : null}
			{/*
			 * 关联入口在修改页面上**不看结论**：判成什么都可以挂缺陷。原先这里由
			 * `needsDefectLink`（失败 / 阻塞 / 跳过）把关，但那条规则解决的是「结果
			 * 页面上不要给通过的用例摆一个空缺陷框」——现在那件事由上面那个提前
			 * return 直接答了，再按结论挡一道就只剩「想挂挂不上」的副作用。
			 */}
			{linked ? null : (
				<DefectLinkActions
					credentialBroken={jira.credentialBroken}
					jiraConfigured={jira.configured}
					runCaseId={runCaseId}
				/>
			)}
		</div>
	);
}
