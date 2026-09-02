/**
 * 节点表单里的单行字段（名称 / 槽位上限）。
 *
 * 与 farm-browsers/farm-browser-field.tsx 同形，刻意各留一份：那一份把
 * `className="font-mono"` 钉死在实现里（它服务的三个值都是要被逐字抄进脚本的
 * 标识符），而这两格恰好相反——节点名是中文短语，等宽字体下中文会被拉成一格
 * 一格的方块；槽位是个一两位的数字，也需要 `type="number"` 那套。硬要合成一个，
 * 参数表会长成两页表单的并集，而两边谁都用不满（同 platform-user-field 那笔账）。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

interface FarmNodeFieldProps {
	/** 内联错误文案；为 null 时该位置展示 hint 里的规则说明。 */
	error: string | null;
	hint: string;
	id: string;
	label: string;
	onChange: (value: string) => void;
	/** 只有槽位那一格传 "number"，其余走默认的 text。 */
	type?: "number" | "text";
	value: string;
}

export function FarmNodeField({
	error,
	hint,
	id,
	label,
	onChange,
	type = "text",
	value,
}: FarmNodeFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange]
	);
	const messageId = `${id}-message`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			{/*
			 * 值一律按字符串来回传，数字框也不例外：`<input type="number">` 的 value
			 * 本来就是字符串，空框、"1.5"、"abc" 三种输入在转成 number 之后会一起
			 * 塌成 NaN，而它们各自该说的话不一样（见 validateMaxSlots）。
			 * autoComplete 一律 off：浏览器把节点名当成姓名或地址来补全没有意义。
			 */}
			<Input
				aria-describedby={messageId}
				aria-invalid={error !== null}
				autoComplete="off"
				id={id}
				onChange={handleChange}
				required={true}
				type={type}
				value={value}
			/>
			{/* 规则说明与错误共用同一个节点，错误出现时下面的字段不会往下跳 */}
			<p
				className={
					error === null
						? "text-muted-foreground text-xs"
						: "text-destructive text-xs"
				}
				id={messageId}
			>
				{error ?? hint}
			</p>
		</div>
	);
}
