/**
 * 目录表单里的一个开关项（是否默认 / 是否启用）。
 *
 * 用 Checkbox 而不是 Switch：本仓的 packages/ui 里没有 switch，而这两项都出现在
 * **提交式表单**里（点完还要按「保存」才生效），checkbox 的语义正好是「提交时
 * 带上这个值」，switch 会让人以为一点就已经改了。
 */
import { Checkbox } from "@automationstack/ui/components/checkbox";
import { Label } from "@automationstack/ui/components/label";

interface FarmBrowserToggleFieldProps {
	checked: boolean;
	/** 一行说明，讲清打开之后会发生什么——这两项的后果都不在字面上。 */
	description: string;
	id: string;
	label: string;
	onChange: (checked: boolean) => void;
}

export function FarmBrowserToggleField({
	checked,
	description,
	id,
	label,
	onChange,
}: FarmBrowserToggleFieldProps) {
	const describedBy = `${id}-description`;

	return (
		<div className="flex items-start gap-3">
			{/* mt-0.5：勾选框与标签首行的文字基线对齐，而不是与整块说明居中 */}
			<Checkbox
				aria-describedby={describedBy}
				checked={checked}
				className="mt-0.5"
				id={id}
				onCheckedChange={onChange}
			/>
			<div className="flex flex-col gap-1">
				<Label htmlFor={id}>{label}</Label>
				<p className="text-muted-foreground text-xs" id={describedBy}>
					{description}
				</p>
			</div>
		</div>
	);
}
