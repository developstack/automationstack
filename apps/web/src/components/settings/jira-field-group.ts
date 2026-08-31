/**
 * 「Jira 集成」四组字段共用的接线，自 jira-settings-fields.tsx（已改名为
 * jira-config-fields.tsx）拆出。
 *
 * 分界线刻意划在「无状态」这一侧：表单的 state、校验、保存与自检全部留在
 * `useJiraConfigForm` 里，由分区组件在原位、原顺序调用；各组字段都是纯展示
 * 组件，一个 hook 都不许持有。理由不是洁癖——受控输入的 state 一旦跟着 JSX
 * 搬进子组件，每敲一个字符就是一次子树重建，焦点当场掉在第一个字符后面；
 * 两个密文格更不能碰，它们的「留空 = 不变」语义全靠值一直待在同一个 state
 * 实例里。
 *
 * 四组共用同一份 `JiraFieldGroupProps`：字段的 id、占位符、说明文案逐格不同，
 * 但取值的来源、禁用条件和「提交过才标红」这条策略必须逐格一致，各组自己开一
 * 套 props 就是给漏掉某一格留位置。这份共用的形状放在这里而不是任何一组里，
 * 四组才都只是它的使用方。
 */
import type { JiraConfigState } from "@automationstack/api/routers/jira";
import { useCallback } from "react";

import type {
	JiraFieldErrors,
	JiraFormValues,
} from "@/components/settings/jira-form-values";

/** 五个 onChange 都要稳定引用：JSX 上现造闭包会让每次输入都重挂控件。 */
export function useFieldHandlers(
	patch: (next: Partial<JiraFormValues>) => void
) {
	return {
		apiToken: useCallback((apiToken: string) => patch({ apiToken }), [patch]),
		defaultIssueType: useCallback(
			(defaultIssueType: string) => patch({ defaultIssueType }),
			[patch]
		),
		email: useCallback((email: string) => patch({ email }), [patch]),
		projectKey: useCallback(
			(projectKey: string) => patch({ projectKey }),
			[patch]
		),
		siteUrl: useCallback((siteUrl: string) => patch({ siteUrl }), [patch]),
		webhookSecret: useCallback(
			(webhookSecret: string) => patch({ webhookSecret }),
			[patch]
		),
	};
}

export type JiraFieldHandlers = ReturnType<typeof useFieldHandlers>;

export interface JiraFieldGroupProps {
	errors: JiraFieldErrors;
	handlers: JiraFieldHandlers;
	/** 只有「Webhook 密钥」用得上；放在共用 props 里换掉一层逐格转发。 */
	onToggleClear: () => void;
	pending: boolean;
	state: JiraConfigState;
	/** 提交过一次没有？各格的红字都要过 `shown()` 这一关，见下。 */
	submitted: boolean;
	values: JiraFormValues;
}

/**
 * 提交过一次之后才标红；之前只做校验不显示。
 *
 * 写成共用的模块级函数而不是在分区组件里现造一个闭包往下传：传下去的闭包每次
 * 渲染都是新引用（biome 的 noJsxPropsBind 正是拦这个），而把 `submitted` 摊给
 * 各组自己判，迟早会有一格判反——那一格就会在用户还没提交时先劈头标红。
 */
export function shown(
	submitted: boolean,
	message: string | null
): string | null {
	return submitted ? message : null;
}
