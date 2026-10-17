import { Button } from "@automationstack/ui/components/button";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

interface CaseBatchBarProps {
	/** 批量操作：改状态等。 */
	children: ReactNode;
	count: number;
	onClear: () => void;
}

/** 用例表格上方的批量操作栏：已选条数、取消选择和批量操作。只在有勾选时显示。 */
export function CaseBatchBar({ children, count, onClear }: CaseBatchBarProps) {
	return (
		<section
			aria-label="批量操作"
			className="fade-in-0 flex min-h-12 animate-in flex-wrap items-center gap-x-3 gap-y-2 border-b bg-accent/40 px-4 py-2 duration-200"
		>
			<p className="text-sm" role="status">
				已选 <span className="numeric font-medium">{count}</span> 条
			</p>
			<Button onClick={onClear} size="sm" variant="ghost">
				<XIcon data-icon="inline-start" />
				取消选择
			</Button>
			<div className="ml-auto flex flex-wrap items-center gap-2">
				{children}
			</div>
		</section>
	);
}
