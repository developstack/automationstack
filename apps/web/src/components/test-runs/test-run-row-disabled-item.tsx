import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

/**
 * 禁用的菜单项：动作名 + 一句可见的理由（从 test-run-row-actions.tsx 拆出来）。
 *
 * 三个动作的禁用态长得一模一样，所以只写一份。理由做成菜单项里的**可见文字**，
 * 而不是 title 或者干脆只留一个灰按钮：title 在触屏和键盘上都出不来，
 * 而「为什么点不动」往往正是用户此刻唯一需要知道的事。
 */
export function TestRunRowDisabledItem({
	label,
	reason,
}: {
	label: string;
	reason: string;
}) {
	return (
		<DropdownMenuItem disabled={true}>
			{label}
			<span className="ml-auto pl-4 text-muted-foreground text-xs">
				{reason}
			</span>
		</DropdownMenuItem>
	);
}
