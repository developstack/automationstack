/**
 * 「测试任务」分区里那一行输入与它下面的提交行。
 *
 * 抽成独立文件只为把 `TestRunSettingsForm` 压回 50 行的函数上限内，边界是
 * 刻意划在「无状态」这一侧的：天数的 state、校验和提交全部留在原组件里，
 * 这里只接收算好的 value / error / hint。受控输入的 state 一旦跟着 JSX 搬进
 * 子组件，每敲一个字符就是一次子树重建，焦点当场丢在第一个字符后面——
 * 这类拆分最常见的真 bug 就长这样，所以这两块必须保持零 hook。
 */
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import type { ChangeEvent } from "react";

import {
	MAX_AUTO_SUBMIT_DAYS,
	MIN_AUTO_SUBMIT_DAYS,
} from "@/components/settings/auto-submit-days";

const FIELD_ID = "settings-auto-submit-days";
const HINT_ID = "settings-auto-submit-days-hint";
const ERROR_ID = "settings-auto-submit-days-error";

export interface TestRunSettingsFieldsProps {
	/** 已经过「提交过一次才标红」这一层筛选；这里不再判断该不该显示。 */
	error: string | null;
	hint: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	pending: boolean;
	/** 按字符串管：转成数字会把「删空重填」的中间态折成 0 写回框里。 */
	value: string;
}

/**
 * 输入行与提交行是两个并列的块，中间没有包裹元素——`<form>` 上的
 * `flex flex-col gap-4` 直接排它俩。这里因此返回 fragment 而不是新套一层
 * div：多一层 div 会多吃一次 gap，两块之间的间距跟页面上别处对不上。
 */
export function TestRunSettingsFields(props: TestRunSettingsFieldsProps) {
	return (
		<>
			<div className="flex flex-col gap-2">
				<Label htmlFor={FIELD_ID}>自动提交等待天数</Label>
				<div className="flex items-center gap-2">
					<Input
						aria-describedby={
							props.error === null ? HINT_ID : `${ERROR_ID} ${HINT_ID}`
						}
						aria-invalid={props.error !== null}
						className="w-28"
						disabled={props.pending}
						id={FIELD_ID}
						// 数字键盘：手机上默认弹出的全键盘要多两步才够得着数字
						inputMode="numeric"
						max={MAX_AUTO_SUBMIT_DAYS}
						min={MIN_AUTO_SUBMIT_DAYS}
						onChange={props.onChange}
						step={1}
						type="number"
						value={props.value}
					/>
					{/* 单位不放进 Label：读屏念字段名时不该带上量纲，它属于值 */}
					<span aria-hidden="true" className="text-muted-foreground text-sm">
						天
					</span>
				</div>
				{props.error === null ? null : (
					<p className="text-destructive text-xs" id={ERROR_ID}>
						{props.error}
					</p>
				)}
				<p className="text-muted-foreground text-xs" id={HINT_ID}>
					{props.hint}
				</p>
			</div>
			<div className="flex justify-end">
				<Button disabled={props.pending} type="submit">
					{props.pending ? "保存中…" : "保存"}
				</Button>
			</div>
		</>
	);
}
