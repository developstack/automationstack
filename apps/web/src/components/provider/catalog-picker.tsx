/**
 * 一个「可搜索的候选选择器」。
 *
 * 为什么是「搜索框 + 下拉」两个控件而不是一个 combobox：193 个 provider、
 * 单个 provider 下上千个 model，纯下拉根本翻不动；而 packages/ui 里没有
 * command / combobox 原件，本仓库的方针又是不自己新写组件。于是用现成的
 * Input + Select 拼：Input 把关键词交给服务端过滤，Select 只从过滤结果里挑一个。
 *
 * 另一半是降级：目录抓不到时 `manual` 打开，同一个字段原地变成自由输入框，
 * 管理员照样能把 provider / model 填进去，而不是被卡死在一个空下拉上。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { type ChangeEvent, useCallback } from "react";

import type {
	CatalogOption,
	CatalogQueryResult,
} from "@/components/provider/provider-catalog-queries";

export interface CatalogPickerProps {
	disabled: boolean;
	/** 候选为空时那行说明；「目录不可用」和「还没选 provider」要说不同的话。 */
	emptyHint: string;
	/** 校验错误。与说明共用同一个节点，读屏因此能顺着 aria-describedby 读到它。 */
	error: string | null;
	id: string;
	keyword: string;
	label: string;
	/** 手工填写模式：不再走候选下拉，直接给自由输入框。 */
	manual: boolean;
	manualHint: string;
	onKeywordChange: (keyword: string) => void;
	onValueChange: (value: string) => void;
	query: CatalogQueryResult<CatalogOption>;
	searchLabel: string;
	value: string;
}

function hintText(
	query: CatalogQueryResult<CatalogOption>,
	emptyHint: string
): string {
	if (query.loading) {
		return "正在加载候选…";
	}
	const count = query.options.length;
	if (count === 0) {
		return emptyHint;
	}
	if (query.truncated) {
		return `共 ${query.total} 项，已显示前 ${count} 项；输入关键词可以找到其余的。`;
	}
	return `共 ${query.total} 项候选。`;
}

/**
 * 关键词一变，已选中的那一项往往就不在候选里了。不补回去的话触发器会显示空白，
 * 看上去像是「刚才选的东西被搜索清掉了」。补进来的那条没有名称，只能退化成 id。
 */
function withSelected(
	options: CatalogOption[],
	value: string
): CatalogOption[] {
	if (value === "" || options.some((option) => option.value === value)) {
		return options;
	}
	return [{ label: value, value }, ...options];
}

/**
 * 说明与错误共用同一个节点：报错时不会凭空多出一行，底下的字段不跟着往下跳；
 * 它同时是控件 aria-describedby 指向的那个节点，读屏念完标签就会念到错误。
 */
function HintLine({
	error,
	hint,
	id,
}: {
	error: string | null;
	hint: string;
	id: string;
}) {
	return (
		<p
			className={
				error === null
					? "text-muted-foreground text-xs"
					: "text-destructive text-xs"
			}
			id={id}
		>
			{error ?? hint}
		</p>
	);
}

function ManualField(props: CatalogPickerProps) {
	const { onValueChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
		[onValueChange]
	);
	const hintId = `${props.id}-hint`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			<Input
				aria-describedby={hintId}
				aria-invalid={props.error !== null}
				autoComplete="off"
				disabled={props.disabled}
				id={props.id}
				onChange={handleChange}
				value={props.value}
			/>
			<HintLine error={props.error} hint={props.manualHint} id={hintId} />
		</div>
	);
}

interface CandidateSelectProps {
	disabled: boolean;
	hintId: string;
	id: string;
	invalid: boolean;
	onValueChange: (value: string) => void;
	options: CatalogOption[];
	value: string;
}

function CandidateSelect(props: CandidateSelectProps) {
	const { onValueChange } = props;
	// Base UI 的清空动作会给 null；把它翻译成「没选」而不是塞个假值进去
	const handleValue = useCallback(
		(next: string | null) => onValueChange(next ?? ""),
		[onValueChange]
	);

	return (
		<Select
			disabled={props.disabled}
			items={props.options}
			onValueChange={handleValue}
			value={props.value === "" ? null : props.value}
		>
			<SelectTrigger
				aria-describedby={props.hintId}
				aria-invalid={props.invalid}
				className="w-full"
				id={props.id}
			>
				<SelectValue placeholder="尚未选择" />
			</SelectTrigger>
			<SelectContent>
				{props.options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function SearchableSelect(props: CatalogPickerProps) {
	const { onKeywordChange } = props;
	const handleKeyword = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			onKeywordChange(event.target.value),
		[onKeywordChange]
	);
	const hintId = `${props.id}-hint`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			{/* aria-label 与 placeholder 一致：语音控制用户念的是屏幕上看得见的字 */}
			<Input
				aria-label={props.searchLabel}
				autoComplete="off"
				disabled={props.disabled}
				onChange={handleKeyword}
				placeholder={props.searchLabel}
				value={props.keyword}
			/>
			<CandidateSelect
				disabled={props.disabled}
				hintId={hintId}
				id={props.id}
				invalid={props.error !== null}
				onValueChange={props.onValueChange}
				options={withSelected(props.query.options, props.value)}
				value={props.value}
			/>
			<HintLine
				error={props.error}
				hint={hintText(props.query, props.emptyHint)}
				id={hintId}
			/>
		</div>
	);
}

export function CatalogPicker(props: CatalogPickerProps) {
	if (props.manual) {
		return <ManualField {...props} />;
	}
	return <SearchableSelect {...props} />;
}
