/**
 * 两类 Jira 字段共用的错误行，自 jira-fields.tsx 拆出——那份文件已按控件分成
 * jira-text-field.tsx 与 jira-secret-field.tsx 两份。
 *
 * 它正是「可访问性接线逐字段一致」这条要求的落点：两边都指向同一份 DOM、
 * 同一条 id 约定，谁也没有机会各写一份。
 */

/**
 * 错误行。两类字段共用同一份 DOM 和同一条 id 约定（`${字段 id}-error`）：
 * 这个 id 正是 aria-describedby 指过去的目标，两边各抄一遍迟早会有一边漏掉，
 * 而漏掉的后果不是「样式不一致」，是读屏用户完全听不到那句报错——控件在他
 * 那边表现为静默拒绝提交。
 *
 * 没有错误时返回 null 而不是空 <p>：留一个存在但为空的节点，读屏念到
 * aria-describedby 的目标时给出的是一段沉默，比根本没有这个节点更难理解。
 */
export function JiraFieldError({
	id,
	message,
}: {
	id: string;
	message: string | null;
}) {
	if (message === null) {
		return null;
	}

	return (
		<p className="text-destructive text-xs" id={id}>
			{message}
		</p>
	);
}
