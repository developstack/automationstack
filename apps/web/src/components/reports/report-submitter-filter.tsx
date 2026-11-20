import { SYSTEM_SUBMITTER } from "@automationstack/db/repositories/test-run-report-list-core";
import type { ReportSubmitter } from "@automationstack/db/repositories/test-run-report-list-repository";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useCallback, useMemo } from "react";

import { submitterLabel } from "@/components/reports/report-list-meta";

const ALL_SUBMITTERS = "all";

interface SubmitterOption {
	label: string;
	value: string;
}

function submitterOptions(
	submitters: readonly ReportSubmitter[]
): SubmitterOption[] {
	return [
		{ label: "全部提交人", value: ALL_SUBMITTERS },
		...submitters.map((submitter) => ({
			label: submitterLabel(submitter.id, submitter.name),
			value: submitter.id ?? SYSTEM_SUBMITTER,
		})),
	];
}

interface ReportSubmitterFilterProps {
	onChange: (submitter: string | undefined) => void;
	submitter: string | undefined;
	submitters: readonly ReportSubmitter[];
}

/** 按提交人筛选。选项是项目中提交过报告的人，系统自动提交也是一个选项。 */
export function ReportSubmitterFilter({
	onChange,
	submitter,
	submitters,
}: ReportSubmitterFilterProps) {
	const options = useMemo(() => submitterOptions(submitters), [submitters]);
	const handleValueChange = useCallback(
		(next: string | null) =>
			onChange(next === null || next === ALL_SUBMITTERS ? undefined : next),
		[onChange]
	);

	return (
		<Select
			items={options}
			onValueChange={handleValueChange}
			value={submitter ?? ALL_SUBMITTERS}
		>
			<SelectTrigger aria-label="按提交人筛选测试报告">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
