/**
 * 「API Token」那一格的加载态。原与 ApiTokensPage 同住 api-tokens-page.tsx，
 * 按「一个文件一个对外组件」拆开；标题块文案两边共用
 * api-tokens-section-meta.ts。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";
import {
	HEADING_ID,
	SECTION_DESCRIPTION,
	SECTION_TITLE,
} from "@/components/api-tokens/api-tokens-section-meta";
import { ApiTokensTableSkeleton } from "@/components/api-tokens/api-tokens-table-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";

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
