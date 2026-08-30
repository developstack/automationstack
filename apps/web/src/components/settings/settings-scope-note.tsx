/**
 * 作用域提示：这一页从项目侧栏进来，而 API Token 那一格改的东西根本不属于
 * 当前项目。
 *
 * 它原先有自己的顶级路由（/api-tokens），挂在全局作用域的一级侧栏上，
 * 「我在改的是全站的东西」由位置本身说清楚了。收进 /projects/<id>/settings
 * 之后那条线索就没了：地址栏、侧栏高亮、面包屑全在说「当前项目」，人会默认把
 * 整页读成项目配置，于是以为自己签发的 Token 只对这一个项目有效。
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

/** 文案点明两件事：改的是谁的东西、以及别人看不看得到。 */
export const TOKENS_SCOPE_NOTE =
	"这里是你自己的 Token，别人看不到，也不跟着项目走。";

/*
 * 「本地 Agent 接入」那一格要挡的误解是另一种：这一整格没有任何可改的设置，
 * 全是说明，而它挂在项目侧栏底下，人会先去找「保存」按钮。所以第一句就说清
 * 它是一份说明、不随项目变；第二句把「权限从哪来」摆到最前面——接上之后
 * agent 能看到和能写坏的东西，完全等于那枚 Token 主人的权限。
 */
export const AGENT_SCOPE_NOTE =
	"这一格是一份接入说明，全平台通用，不随项目变，也没有需要保存的设置。接上之后 agent 的身份与权限，就是你用来连接的那枚 API Token 主人的身份与权限。";

export function SettingsScopeNote({ children }: { children: ReactNode }) {
	return (
		<p className="rounded-lg bg-muted p-3 text-muted-foreground text-xs">
			{children}
		</p>
	);
}
