/**
 * 一个「可搜索的候选选择器」：单个 combobox 输入框，击键即筛菜单项。
 *
 * 形态：Base UI Combobox 原语（packages/ui/combobox.tsx 薄封装）+ 服务端过滤。
 * 输入框自己就是触发器：非聚焦时显示已选项的 label，聚焦输入变成关键词，
 * 清空则取消选中并回到全量列表。防抖不在这一层——UI 只把击键交给 keyword
 * （onKeywordChange），真正的 300ms 防抖在 provider-catalog-queries 的
 * useDebouncedValue 里，与请求节奏解耦是既有设计。
 *
 * 客户端不过滤：Root 挂 filter={null} 关掉内置 collator 匹配，候选永远以
 * 服务端返回为准（否则选中后输入框里填的完整 label 会被当成查询词把菜单清空）。
 *
 * 另一半是降级：目录抓不到时 `manual` 打开，同一个字段原地变成自由输入框，
 * 管理员照样能把 provider / model 填进去，而不是被卡死在一个空下拉上。
 */
import {
	Combobox,
	type ComboboxChangeEventDetails,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
} from "@automationstack/ui/components/combobox";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { type ChangeEvent, useCallback, useMemo } from "react";

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
 * 关键词一变，已选中的那一项往往就不在候选里了。不补回去的话：菜单里看不到
 * 选中项的勾标，输入框也丢了双语 label、退化显示裸 id（itemToStringLabel
 * 兑底到 value 本身），看上去像「刚才选的东西被搜索清掉了」。补回的那条
 * 没有名称，label 只能等于 id——两种情况都退化，但至少选中态是完整的。
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

/* 表单里存的是 id；输入框要展示的是目录里那条的 label（含双语段）。
 * 用 itemToStringLabel 交给 Base UI 换算，而不是把裸 id 塞给用户；候选里
 * 找不到时退化成 id 本身（与 withSelected 的兑底条目间一行为）。 */
function labelOf(options: CatalogOption[]): (value: string) => string {
	return (value) =>
		options.find((option) => option.value === value)?.label ?? value;
}

interface CandidateComboboxProps {
	disabled: boolean;
	emptyHint: string;
	hintId: string;
	id: string;
	invalid: boolean;
	/** 关键词请求在飞：空列表的 Empty 要说「正在加载」而不是误导性的「没有匹配」。 */
	keywordLoading: boolean;
	onKeywordChange: (keyword: string) => void;
	onValueChange: (value: string) => void;
	options: CatalogOption[];
	searchLabel: string;
	value: string;
}

/* 弹层里的候选列表：选项 + 空态。从 CandidateCombobox 拆出来纯粹是为了
 * 过 max-lines-per-function，两者总是一起用。 */
function CandidateList(props: { emptyText: string; options: CatalogOption[] }) {
	return (
		<ComboboxContent>
			{props.options.map((option) => (
				<ComboboxItem key={option.value} value={option.value}>
					{option.label}
				</ComboboxItem>
			))}
			<ComboboxEmpty>{props.emptyText}</ComboboxEmpty>
		</ComboboxContent>
	);
}

function CandidateCombobox(props: CandidateComboboxProps) {
	const { onKeywordChange, onValueChange } = props;

	// Base UI 的清空动作会给 null；把它翻译成「没选」而不是塞个假值进去
	const handleValue = useCallback(
		(next: string | null) => onValueChange(next ?? ""),
		[onValueChange]
	);
	// onInputValueChange 对每次 setInputValue 都发（包括选中后自动填 label、
	// 关弹层时回同步），不过滤 reason 的话完整 label 串会变成服务端查询词。
	const handleInputValue = useCallback(
		(inputValue: string, eventDetails: ComboboxChangeEventDetails) => {
			if (
				eventDetails.reason === "input-change" ||
				eventDetails.reason === "input-clear"
			) {
				onKeywordChange(inputValue);
			}
		},
		[onKeywordChange]
	);
	const itemToStringLabel = useMemo(
		() => labelOf(props.options),
		[props.options]
	);

	return (
		<Combobox
			// 客户端不过滤，见文件头注释；空关键词时服务端本来就返回全量。
			filter={null}
			items={props.options}
			itemToStringLabel={itemToStringLabel}
			onInputValueChange={handleInputValue}
			onValueChange={handleValue}
			value={props.value === "" ? null : props.value}
		>
			{/* aria-label 与 placeholder 一致：语音控制用户念的是屏幕上看得见的字 */}
			<ComboboxInput
				aria-describedby={props.hintId}
				aria-invalid={props.invalid}
				aria-label={props.searchLabel}
				autoComplete="off"
				disabled={props.disabled}
				id={props.id}
				placeholder={props.searchLabel}
			/>
			<CandidateList
				emptyText={props.keywordLoading ? "正在加载候选…" : props.emptyHint}
				options={props.options}
			/>
		</Combobox>
	);
}

function SearchableCombobox(props: CatalogPickerProps) {
	const hintId = `${props.id}-hint`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			<CandidateCombobox
				disabled={props.disabled}
				emptyHint={props.emptyHint}
				hintId={hintId}
				id={props.id}
				invalid={props.error !== null}
				keywordLoading={props.query.loading}
				onKeywordChange={props.onKeywordChange}
				onValueChange={props.onValueChange}
				options={withSelected(props.query.options, props.value)}
				searchLabel={props.searchLabel}
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
	return <SearchableCombobox {...props} />;
}
