/**
 * 个人 API Token 管理页主体。
 *
 * 为什么是独立的 /api-tokens 而不是塞进「设置」页（plan §8 的原话是「『设置』
 * 页的 token 管理 UI」）：
 *
 * /settings 是**项目维度**的页面——它在选定项目前什么都不渲染
 * （settings-page.tsx 里 `current === undefined ? null : <SettingsSections/>`），
 * 一个项目都没有时只剩 NoProjectsNotice，而且两个分区都被 `key={projectId}`
 * 强制重挂。而 token 是**个人**凭据，跟项目一点关系没有。塞进去会有两个真问题：
 * 还没建项目的人（新账号第一天就想接 CI 的那种）根本拿不到自己的 token；
 * 每次切项目都把一份与项目无关的列表白重挂一次。
 *
 * 所以按 /members 和 /ai-provider 的先例开独立路由。
 *
 * 另外这一页**没有任何角色判断**：apiTokens 的三个过程都是 protectedProcedure，
 * 人人可用。members / ai-provider 那两页开头的 role 检查是因为它们背后是
 * adminProcedure，这儿照抄过来就成了前端擅自加的一道后端没有的权限。
 */
import { Button } from "@automationstack/ui/components/button";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { ApiTokensTable } from "@/components/api-tokens/api-tokens-table";
import { CreateApiTokenDialog } from "@/components/api-tokens/create-api-token-dialog";

export function ApiTokensPage() {
	const [creating, setCreating] = useState(false);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-xs">
					给自动化脚本用的个人凭据：脚本拿它以你的身份回传测试结果。明文只在创建时显示一次。
				</p>
				<Button onClick={openCreate}>
					<PlusIcon aria-hidden="true" data-icon="inline-start" />
					新建 Token
				</Button>
			</div>
			<ApiTokensTable />
			<CreateApiTokenDialog onClose={closeCreate} open={creating} />
		</section>
	);
}
