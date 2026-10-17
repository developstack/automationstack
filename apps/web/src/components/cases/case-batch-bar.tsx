import { Button } from "@automationstack/ui/components/button";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

interface CaseBatchBarProps {
	/** 批量操作：改状态等。 */
	children: ReactNode;
	/** 清空按钮的文字：「取消选择」或「取消全部选择」。 */
	clearLabel: string;
	onClear: () => void;
	/** 已选的范围，见 CaseBatchSummary。 */
	summary: ReactNode;
}

/** 用例表格上方的批量操作栏：已选的范围、取消选择和批量操作。只在有勾选时显示。 */
export function CaseBatchBar({
	children,
	clearLabel,
	onClear,
	summary,
}: CaseBatchBarProps) {
	return (
		<section
			aria-label="批量操作"
			className="fade-in-0 flex min-h-12 animate-in flex-wrap items-center gap-x-3 gap-y-2 border-b bg-accent/40 px-4 py-2 duration-200"
		>
			{summary}
			<Button onClick={onClear} size="sm" variant="ghost">
				<XIcon data-icon="inline-start" />
				{clearLabel}
			</Button>
			<div className="ml-auto flex flex-wrap items-center gap-2">
				{children}
			</div>
		</section>
	);
}
