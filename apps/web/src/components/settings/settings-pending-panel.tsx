/**
 * 路由 pendingComponent 里那一格，自 settings-tab-panels.tsx 拆出。
 * 面板的 gap 仍与就绪态共用那边的 PANEL 常量——两态同宽同节奏是这一格的全部意义。
 */
import { TabsContent } from "@automationstack/ui/components/tabs";

import { ApiTokensPagePending } from "@/components/api-tokens/api-tokens-page-pending";
import {
	SettingsScopeNote,
	TOKENS_SCOPE_NOTE,
} from "@/components/settings/settings-scope-note";
import {
	type SettingsTab,
	TOKENS_TAB,
} from "@/components/settings/settings-tab";
import { PANEL } from "@/components/settings/settings-tab-panels";

/**
 * 路由 pendingComponent 里那一格。
 *
 * 只有 API Token 那一格会走到这里：项目设置与 Jira 那两格的 loader 不等任何
 * 查询（两个分区各自取数、各自失败，理由见 settings-section.tsx 顶部），loader
 * 当场就回，200ms 的 pending 阈值根本够不着，所以那两格返回 null 而不是画一份
 * 永远不会上场的骨架。本地 Agent 接入那一格连查询都没有，同理返回 null。
 *
 * 作用域提示在骨架里也要摆上，且与就绪态是同一个组件：它是静态文案，第一帧就
 * 拿得到；骨架里省掉它，数据到达那一帧整块表格会被凭空插进来的一段说明往下推。
 * 面板的 gap 同理，两态共用上面那个 PANEL 常量（宽度由外面那一列给，pending
 * 态与就绪态挂在同一个 Tabs 根下，天然同宽）。同一条理由往下再走一层，
 * 所以这里挂的是 ApiTokensPagePending（分区标题 + 按钮行 + 表格骨架）而不是
 * 光秃秃的 ApiTokensTableSkeleton——后者会漏掉那 88px 的标题块与按钮行。
 */
export function SettingsPendingPanel({ tab }: { tab: SettingsTab }) {
	if (tab === TOKENS_TAB) {
		return (
			<TabsContent className={PANEL} value={TOKENS_TAB}>
				<SettingsScopeNote>{TOKENS_SCOPE_NOTE}</SettingsScopeNote>
				<ApiTokensPagePending />
			</TabsContent>
		);
	}
	return null;
}
