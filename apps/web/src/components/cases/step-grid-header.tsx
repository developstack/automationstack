import { cn } from "@automationstack/ui/lib/utils";

import { CASE_TABLE_HEAD_CLASS } from "@/components/cases/case-table-layout";

/** 步骤的表头和每一行共用的列：编号、操作步骤、预期结果、操作。编辑模式和查看模式都用这些列。 */
export const STEP_GRID_CLASS =
	"grid grid-cols-1 gap-3 px-3 sm:grid-cols-case-step";

/** 表头使用表格的表头样式（CASE_TABLE_HEAD_CLASS）：小标签、灰色。窄屏不显示。 */
export function StepGridHeader() {
	return (
		<div
			aria-hidden="true"
			className={cn(
				STEP_GRID_CLASS,
				CASE_TABLE_HEAD_CLASS,
				"hidden items-center border-b sm:grid"
			)}
		>
			<span className="pl-1">#</span>
			<span>操作步骤</span>
			<span>预期结果</span>
			<span className="w-6" />
		</div>
	);
}
