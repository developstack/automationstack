/**
 * 浏览器目录表单里的单行字段。
 *
 * 与 platform-users/platform-user-field.tsx 同形，刻意各留一份：那一份的 props
 * 里钉着 `autoComplete` 与 `type: "password" | "text"`（它服务的是账号密码表单），
 * 本表单一个密码字段也没有、却全都需要 `monospace`（镜像引用与版本号是要被逐字
 * 抄进脚本的）。硬要合成一个，参数表会长成两页表单的并集，而两边谁都用不满。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback } from "react";

interface FarmBrowserFieldProps {
	/** 内联错误文案；为 null 时该位置展示 hint 里的规则说明。 */
	error: string | null;
	hint: string;
	id: string;
	label: string;
	onChange: (value: string) => void;
	value: string;
}

export function FarmBrowserField({
	error,
	hint,
	id,
	label,
	onChange,
	value,
}: FarmBrowserFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
		[onChange]
	);
	const messageId = `${id}-message`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			{/*
			 * font-mono：这三个值都是要被逐字抄进脚本或 docker 命令的标识符，
			 * 等宽字体下 l/1、O/0 分得开，抄错一个字符的后果是容器起不来。
			 * autoComplete 一律 off：浏览器把镜像名当成地址或用户名来补全没有意义。
			 */}
			<Input
				aria-describedby={messageId}
				aria-invalid={error !== null}
				autoComplete="off"
				className="font-mono"
				id={id}
				onChange={handleChange}
				required={true}
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
