/**
 * 设置页顶部的项目选择器。
 *
 * 它之所以存在，是一笔明摆着的取舍（plan §7.5）：一级侧栏的其余几项都是全局
 * 作用域的（`ai_provider_config` 甚至是 id 固定的单例表），而本页两项配置都是
 * 项目级的。按用户指定的位置把「设置」放进一级侧栏，代价就是这一行——
 * 没有它，页面根本说不清自己正在改谁的配置。
 */
import type { Project } from "@automationstack/db/schema/projects";
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useCallback, useMemo } from "react";

const FIELD_ID = "settings-project";

export interface SettingsProjectPickerProps {
	onSelect: (projectId: string) => void;
	projects: Project[];
	/** 当前选中；URL 里指的项目已被删掉时为 undefined，此时显示占位符。 */
	selectedId: string | undefined;
}

export function SettingsProjectPicker(props: SettingsProjectPickerProps) {
	const { onSelect, projects, selectedId } = props;

	// Select 的 items 只吃 { label, value }，且要稳定引用——每次渲染重造一份
	// 会让下拉在开着的时候重挂、把键盘焦点丢掉。
	const items = useMemo(
		() =>
			projects.map((project) => ({ label: project.name, value: project.id })),
		[projects]
	);

	const handleValueChange = useCallback(
		(value: string | null) => {
			// null 只在 Select 被清空时出现，本选择器没有「不选」这一态，直接忽略
			if (value !== null) {
				onSelect(value);
			}
		},
		[onSelect]
	);

	return (
		// 横排：这一行是页面的作用域说明，不是一个普通字段，竖排会让它看着像
		// 「第一项配置」，而它管着下面所有分区
		<div className="flex flex-wrap items-center gap-3">
			<Label className="shrink-0" htmlFor={FIELD_ID}>
				项目
			</Label>
			<Select
				items={items}
				onValueChange={handleValueChange}
				value={selectedId ?? null}
			>
				<SelectTrigger className="min-w-56" id={FIELD_ID}>
					<SelectValue placeholder="选择项目" />
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
