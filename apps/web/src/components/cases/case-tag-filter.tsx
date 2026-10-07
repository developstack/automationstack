import { Button } from "@automationstack/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@automationstack/ui/components/popover";
import { useQuery } from "@tanstack/react-query";
import { TagIcon } from "lucide-react";
import { useCallback } from "react";

import { orpc } from "@/utils/orpc";

const NO_TAGS: string[] = [];

interface TagToggleProps {
	active: boolean;
	onToggle: (tag: string) => void;
	value: string;
}

function TagToggle({ active, onToggle, value }: TagToggleProps) {
	const handleClick = useCallback(() => onToggle(value), [onToggle, value]);
	return (
		<Button
			aria-pressed={active}
			onClick={handleClick}
			size="sm"
			type="button"
			variant={active ? "default" : "outline"}
		>
			{value}
		</Button>
	);
}

interface TagOptionsProps {
	loading: boolean;
	onToggle: (tag: string) => void;
	options: string[];
	selected: string[];
}

function TagOptions({ loading, onToggle, options, selected }: TagOptionsProps) {
	if (loading) {
		return null;
	}
	if (options.length === 0) {
		return (
			<p className="text-muted-foreground">该项目下的用例还没有打过标签。</p>
		);
	}
	return (
		<fieldset aria-label="按标签筛选" className="flex flex-wrap gap-1">
			{options.map((tag) => (
				<TagToggle
					active={selected.includes(tag)}
					key={tag}
					onToggle={onToggle}
					value={tag}
				/>
			))}
		</fieldset>
	);
}

interface CaseTagFilterProps {
	onChange: (tags: string[]) => void;
	projectId: string;
	tags: string[];
}

function useTagSelection(tags: string[], onChange: (tags: string[]) => void) {
	const toggle = useCallback(
		(value: string) =>
			onChange(
				tags.includes(value)
					? tags.filter((tag) => tag !== value)
					: [...tags, value]
			),
		[onChange, tags]
	);
	const clear = useCallback(() => onChange(NO_TAGS), [onChange]);
	return { clear, toggle };
}

export function CaseTagFilter({
	onChange,
	projectId,
	tags,
}: CaseTagFilterProps) {
	const tagsQuery = useQuery(
		orpc.cases.listTags.queryOptions({ input: { projectId } })
	);
	const { clear, toggle } = useTagSelection(tags, onChange);

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button type="button" variant="outline">
						<TagIcon data-icon="inline-start" />
						{tags.length === 0 ? "标签" : `标签 · ${tags.length}`}
					</Button>
				}
			/>
			<PopoverContent align="start">
				<TagOptions
					loading={tagsQuery.isPending}
					onToggle={toggle}
					options={tagsQuery.data ?? NO_TAGS}
					selected={tags}
				/>
				{tags.length > 0 ? (
					<Button
						className="self-start"
						onClick={clear}
						size="sm"
						type="button"
						variant="ghost"
					>
						清除标签
					</Button>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
