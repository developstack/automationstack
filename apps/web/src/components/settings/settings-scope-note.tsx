/**
 * 作用域提示：这一页从项目侧栏进来，而其中三格改的东西根本不属于当前项目。
 *
 * 这三块原先各有自己的顶级路由（/ai-provider、/api-tokens、/members），挂在全局
 * 作用域的一级侧栏上，「我在改的是全站的东西」由位置本身说清楚了。收进
 * /projects/<id>/settings 之后那条线索就没了：地址栏、侧栏高亮、面包屑全在说
 * 「当前项目」，人会默认把整页读成项目配置，于是改一次 AI 配置以为只影响自己
 * 这个项目，停用一个账号以为只是把人移出项目。
 *
 * 所以提示必须是**可见文案**，不能只写在注释、tooltip 或 aria-label 里——要挡的
 * 正是「看一眼就动手」的那种误解，藏起来的说明来不及起作用。
 *
 * 样式取 muted 底色的小字块，字号与 settings-section.tsx 里分区描述的 text-xs
 * 同档：它是一句说明，不是异常态；用 destructive 或 alert 那套配色会把「这是
 * 全站的」念成「出错了」。也不给 role——内容是静态的，页面一进来就在那儿，不是
 * 刚发生的事，挂 role="status" 只会让读屏在无事发生时多播一遍。
 */
import type { ReactNode } from "react";

/**
 * 三句文案都点明两件事：改的是谁的东西、以及谁能改。
 *
 * 「只有管理员能改」这句是描述现状而不是新加的限制：AI 配置与平台账号背后都是
 * adminProcedure，非管理员本来就存不进去（也看不到这两格 tab，判定见
 * settings-tabs.tsx）。写出来是为了让管理员知道自己手上这一改影响到谁。
 */
export const AI_SCOPE_NOTE =
	"这里登记的 Provider 对整个平台生效，不只当前项目。只有管理员能改。";
export const MEMBERS_SCOPE_NOTE =
	"这里管理的是整个平台的账号，不只当前项目的成员。只有管理员能改。";
export const TOKENS_SCOPE_NOTE =
	"这里是你自己的 Token，别人看不到，也不跟着项目走。";

export function SettingsScopeNote({ children }: { children: ReactNode }) {
	return (
		<p className="rounded-lg bg-muted p-3 text-muted-foreground text-xs">
			{children}
		</p>
	);
}
