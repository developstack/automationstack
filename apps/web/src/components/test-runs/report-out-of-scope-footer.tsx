import { Button } from "@automationstack/ui/components/button";

/**
 * 越界用例表下面那一行（从 report-out-of-scope-card.tsx 拆出来）。
 *
 * 已锁定时它是一句解释——这几条为什么还留在报告里；
 * 未锁定时它是「顺手把别的也挑了」的入口，外加一句「追加之后会发生什么」，
 * 免得有人点完才发现测试任务从「已完成」退回了「测试中」。
 */
export function ReportOutOfScopeFooter({
	locked,
	onPick,
}: {
	locked: boolean;
	onPick: () => void;
}) {
	if (locked) {
		return (
			<p className="text-muted-foreground text-sm">
				报告已提交并锁定，不能再追加用例。这几条留在这里是为了让读报告的人知道：这一轮脚本报的结论有一部分没进任何任务。
			</p>
		);
	}
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button onClick={onPick} size="sm" type="button" variant="ghost">
				从用例库挑选…
			</Button>
			<span className="text-muted-foreground text-xs">
				追加进来的用例结论是「未测」，测试任务会退回「测试中」。
			</span>
		</div>
	);
}
