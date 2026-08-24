/**
 * 测试任务的两个文本字段（名称、说明）。
 *
 * 新建抽屉与编辑对话框各自是一个组件、两种壳，但这两个输入框是同一件事，
 * 各写一份的下场是标签文案、占位文案、必填与否慢慢对不上。
 * 字段 id 写死不做参数：新建与编辑不会同时开着（列表页两者互斥），
 * 页面上永远只有一份，不会撞 id。
 */
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, useCallback } from "react";

const NAME_FIELD_ID = "test-run-name";
const DESCRIPTION_FIELD_ID = "test-run-description";

interface RunFieldsProps {
	description: string;
	name: string;
	onDescriptionChange: (value: string) => void;
	onNameChange: (value: string) => void;
}

export function RunFields({
	description,
	name,
	onDescriptionChange,
	onNameChange,
}: RunFieldsProps) {
	const handleName = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onNameChange(event.target.value),
		[onNameChange]
	);
	const handleDescription = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			onDescriptionChange(event.target.value),
		[onDescriptionChange]
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Label htmlFor={NAME_FIELD_ID}>测试任务名称</Label>
				<Input
					id={NAME_FIELD_ID}
					onChange={handleName}
					placeholder="例如：v2.4.0 回归"
					required={true}
					value={name}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor={DESCRIPTION_FIELD_ID}>说明</Label>
				<Textarea
					id={DESCRIPTION_FIELD_ID}
					onChange={handleDescription}
					placeholder="可选：这一轮测什么、什么环境"
					value={description}
				/>
			</div>
		</div>
	);
}
