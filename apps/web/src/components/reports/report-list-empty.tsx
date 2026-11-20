import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { FileTextIcon } from "lucide-react";

const EMPTY_TEXTS = {
	filtered: {
		hint: "换个关键词、提交人或日期范围看看。",
		title: "没有符合条件的测试报告",
	},
	none: {
		hint: "测试任务完成后，在报告页点击「提交报告」，或者等系统自动提交。提交的报告显示在这里。",
		title: "还没有提交的测试报告",
	},
} as const;

/** 报告列表为空：有筛选条件，或项目还没有提交的报告。 */
export function ReportListEmpty({ filtered }: { filtered: boolean }) {
	const { hint, title } = EMPTY_TEXTS[filtered ? "filtered" : "none"];
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<FileTextIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{hint}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
