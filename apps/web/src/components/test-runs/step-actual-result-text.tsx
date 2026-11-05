import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, type ClipboardEvent, useCallback } from "react";

const PLACEHOLDER =
	"这一步实际发生了什么。失败和阻塞时必填，这两种步骤的实际结果会汇总进用例说明。可以粘贴或拖入截图和录屏";

const VERDICT_FIRST_HINT = "先选择这一步的判定，再填写实际结果或添加实际附件";

function ReadOnlyActualResult({ value }: { value: string }) {
	if (value.trim() === "") {
		return <p className="text-muted-foreground text-sm">—</p>;
	}
	return <p className="whitespace-pre-wrap break-words text-sm">{value}</p>;
}

/** 没有判定的步骤：不能填写实际结果。以前的草稿中已有的文字只读显示，选择判定后可以修改。 */
function UnjudgedActualResult({ value }: { value: string }) {
	return (
		<>
			{value.trim() === "" ? null : <ReadOnlyActualResult value={value} />}
			<p className="text-muted-foreground text-sm">{VERDICT_FIRST_HINT}</p>
		</>
	);
}

interface StepActualResultTextProps {
	editing: boolean;
	headingId: string;
	judged: boolean;
	onChange: (text: string) => void;
	onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
	required: boolean;
	value: string;
}

/** 实际结果的文字：编辑时是输入框，可以粘贴文件；没有判定时先提示选择判定；不编辑时只读。 */
export function StepActualResultText({
	editing,
	headingId,
	judged,
	onChange,
	onPaste,
	required,
	value,
}: StepActualResultTextProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
		[onChange]
	);
	if (!editing) {
		return <ReadOnlyActualResult value={value} />;
	}
	if (!judged) {
		return <UnjudgedActualResult value={value} />;
	}
	return (
		<Textarea
			aria-invalid={required && value.trim() === ""}
			aria-labelledby={headingId}
			aria-required={required}
			onChange={handleChange}
			onPaste={onPaste}
			placeholder={PLACEHOLDER}
			rows={3}
			value={value}
		/>
	);
}
