/**
 * 个人 API Token 管理页主体。
 *
 * 它曾是独立的顶级路由 /api-tokens，现在是 /projects/<id>/settings 的「API Token」
 * 那一格。搬进去而不再各占一条路由，是因为原来那两条理由都不成立了：那时的
 * /settings 在选定项目前什么都不渲染、两个分区还被 `key={projectId}` 强制重挂，
 * 把个人凭据塞进去等于「没建项目就拿不到自己的 token」「每切一次项目白重挂一次」；
 * 如今设置页的 projectId 由路由参数直给，这一格与项目参数没有任何关系，
 * 不带 key、也不随切项目重挂（见 settings-tab-panels.tsx）。
 *
 * 这一格改的是**你自己**的东西，而它却挂在项目侧栏底下，所以面板上方压了一句
 * 可见的作用域说明（settings-scope-note.tsx）。
 *
 * 另外这一页**没有任何角色判断**：apiTokens 的三个过程都是 protectedProcedure，
 * 人人可用。「AI 配置」「平台账号」那两格开头的 role 检查是因为它们背后是
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
