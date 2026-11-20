import { Input } from "@automationstack/ui/components/input";
import { type ChangeEvent, useCallback } from "react";

interface DateInputProps {
	label: string;
	onChange: (date: string | undefined) => void;
	value: string | undefined;
}

function DateInput({ label, onChange, value }: DateInputProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			onChange(event.target.value === "" ? undefined : event.target.value),
		[onChange]
	);
	return (
		<Input
			aria-label={label}
			className="w-36"
			onChange={handleChange}
			type="date"
			value={value ?? ""}
		/>
	);
}

interface ReportDateFilterProps {
	from: string | undefined;
	onFromChange: (date: string | undefined) => void;
	onToChange: (date: string | undefined) => void;
	to: string | undefined;
}

/** 按提交日期筛选。两个日期都包含在内，可以只填一个。 */
export function ReportDateFilter({
	from,
	onFromChange,
	onToChange,
	to,
}: ReportDateFilterProps) {
	return (
		<div className="flex items-center gap-1.5 text-muted-foreground text-sm">
			<span>提交日期</span>
			<DateInput label="提交日期的开始" onChange={onFromChange} value={from} />
			<span aria-hidden="true">至</span>
			<DateInput label="提交日期的结束" onChange={onToChange} value={to} />
		</div>
	);
}
