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
 * ## 外壳走 SettingsSection，不自己手搓一个标题块
 *
 * 这一格与另外三格并排在同一条 tab 条下，切过去时**第一行内容必须落在同一条
 * 基线上**。原先这里是一个 `flex items-center justify-between` 的行：左边一句
 * `text-xs` 说明、右边一颗 h-8 的按钮，说明被按钮撑起来的行高垂直居中，于是
 * 从别的格切过来时首行往下掉约 8px（(32 − 16) / 2）；而且它根本没有 `<h2>`，
 * 读屏在四格之间跳转时这一格没有标题可念，`<section>` 也没有 aria-labelledby。
 * 改用 SettingsSection 之后，标题块的形状（gap-1 + `font-medium text-sm` 的 h2
 * + `text-muted-foreground text-xs` 的说明）与其余三格逐字同源。
 *
 * 「新建 Token」因此单独占一行，不塞回标题块里：塞回去就是把刚拆掉的那次垂直
 * 居中原样装回来。它仍在表格**上方**——空态那段文案写的是「点上面的
 * 「新建 Token」」（api-tokens-table.tsx），按钮挪到下面那句话就成了错的。
 *
 * 另外这一页**没有任何角色判断**：apiTokens 的三个过程都是 protectedProcedure，
 * 人人可用。「AI 配置」「平台账号」那两格开头的 role 检查是因为它们背后是
 * adminProcedure，这儿照抄过来就成了前端擅自加的一道后端没有的权限。
 */
import { Button } from "@automationstack/ui/components/button";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import {
	ApiTokensTable,
	ApiTokensTableSkeleton,
} from "@/components/api-tokens/api-tokens-table";
import { CreateApiTokenDialog } from "@/components/api-tokens/create-api-token-dialog";
import { SettingsSection } from "@/components/settings/settings-section";

/*
 * 与就绪态共用同一个 headingId：两态是路由的 pendingComponent 与 component，
 * 永远不会同时在树上，id 不会撞；而它们若各给一个 id，切换那一帧 h2 的身份会
 * 换掉，读屏会把同一段标题重念一遍。
 */
const HEADING_ID = "settings-api-tokens-heading";
const SECTION_TITLE = "API Token";
const SECTION_DESCRIPTION =
	"给自动化脚本用的个人凭据：脚本拿它以你的身份回传测试结果。明文只在创建时显示一次。";

export function ApiTokensPage() {
	const [creating, setCreating] = useState(false);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<div className="flex justify-end">
				<Button onClick={openCreate}>
					<PlusIcon aria-hidden="true" data-icon="inline-start" />
					新建 Token
				</Button>
			</div>
			<ApiTokensTable />
			<CreateApiTokenDialog onClose={closeCreate} open={creating} />
		</SettingsSection>
	);
}

/**
 * 路由 pendingComponent 里的这一格。
 *
 * 骨架必须连标题块和按钮行一起摆上，而不是只画一张表格：标题与说明是静态文案、
 * 第一帧就拿得到，省掉它们，数据到达那一帧会被凭空插进来的标题块（20 + 4 + 16
 * = 40px）加上按钮行（32 + 16 = 48px）把整张表往下推 88px。理由与
 * settings-tab-panels.tsx 里「作用域提示在骨架里也要摆上」逐字同源。
 *
 * 按钮占位 w-28（112px）：Button default 档 `has-data-[icon=inline-start]:pl-2`
 * 8px + 图标 16px + gap-1.5 6px + 「新建 Token」约 72px + pr-2.5 10px。
 */
export function ApiTokensPagePending() {
	return (
		<SettingsSection
			description={SECTION_DESCRIPTION}
			headingId={HEADING_ID}
			title={SECTION_TITLE}
		>
			<div className="flex justify-end">
				<Skeleton className="h-8 w-28" />
			</div>
			<ApiTokensTableSkeleton />
		</SettingsSection>
	);
}
