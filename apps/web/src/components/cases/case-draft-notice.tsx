/**
 * 「这份内容是恢复出来的」提示条 + 放弃草稿的出口；以及它的反面——
 * 「你点的那份草稿已经不在了」。
 *
 * 为什么必须存在：用户点开抽屉，里面却已经有字了。没有这句话他只会以为系统串了
 * 别人的数据，或者以为自己点错了；而且他没有任何办法回到一张真正的空表单——
 * 清空每个字段是可行但荒谬的操作，何况还清不掉那批已经传上去的图。
 *
 * ⚠️ 现在这条提示只在**用户自己点了「继续编辑」**（URL 带 `?draft=<caseId>`）时
 * 才会出现。以前是「模块里有草稿就自动恢复」，那条路已经拆掉了：新建永远是空表单，
 * 模块里还有哪些草稿由 `case-draft-picker.tsx` 另给一条不打扰的提示。
 *
 * 用常驻提示条而不是 toast：toast 几秒就消失了，而「放弃草稿」这个出口必须
 * 一直挂在那儿，直到用户自己做出选择。位置与 `case-conflict-alert.tsx` 一致
 * （标题栏下方、正文之上），几处提示不会各自漂到不同的地方。
 */
import { Button } from "@automationstack/ui/components/button";
import { HistoryIcon, TriangleAlertIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";

/**
 * 抽屉顶部提示条的外观。导出是为了让 `case-draft-picker.tsx` 用同一份——
 * 两条提示上下紧挨着，任何一处差异（内边距、字号、边框）都会看成是错位。
 */
export const DRAFT_BANNER_CLASS =
	"flex items-start gap-2 border-b bg-muted/40 px-4 py-2 text-muted-foreground text-xs";

interface CaseDraftNoticeProps {
	/**
	 * URL 指名要恢复的草稿没找到（在别处删掉了、或换了台电脑打开这个链接）。
	 * 这时表单是空的，但**不能什么都不说**：用户刚点的是「继续编辑」，
	 * 迎面一张空表单只会读成「我的草稿丢了」。
	 */
	missing: boolean;
	onDiscard: () => void;
	/** 恢复出来的那份草稿的写入时刻；不是恢复来的就传 null。 */
	restoredAt: number | null;
}

export function CaseDraftNotice({
	missing,
	onDiscard,
	restoredAt,
}: CaseDraftNoticeProps) {
	if (missing) {
		return (
			// role="alert"：这条是「你要的东西没了」，与下面那条纯告知的提示不同，
			// 值得读屏立刻打断一次。
			<div className={DRAFT_BANNER_CLASS} role="alert">
				<TriangleAlertIcon className="icon-stroke-regular mt-0.5 size-3.5 shrink-0" />
				<p className="flex-1">
					要继续编辑的那份草稿已经不在这台电脑上了（可能已经删掉，或者换了浏览器打开这个链接）。下面是一张空白的新建表单。
				</p>
			</div>
		);
	}

	if (restoredAt === null) {
		return null;
	}

	return (
		<div className={DRAFT_BANNER_CLASS} role="status">
			<HistoryIcon className="icon-stroke-regular mt-0.5 size-3.5 shrink-0" />
			<p className="flex-1">
				{`已恢复 ${formatDateTime(new Date(restoredAt))} 留在这台电脑上的草稿。继续编辑会接着存到本地，创建成功后自动清掉。`}
			</p>
			<Button onClick={onDiscard} size="xs" type="button" variant="ghost">
				放弃草稿
			</Button>
		</div>
	);
}
