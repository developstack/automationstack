import { Button } from "@automationstack/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@automationstack/ui/components/popover";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@automationstack/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { TagIcon } from "lucide-react";
import { useCallback } from "react";

import { orpc } from "@/utils/orpc";

const NO_TAGS: string[] = [];

interface TagOptionsProps {
	failed: boolean;
	loading: boolean;
	onChange: (tags: string[]) => void;
	onRetry: () => void;
	options: string[];
	selected: string[];
}

function TagOptions({
	failed,
	loading,
	onChange,
	onRetry,
	options,
	selected,
}: TagOptionsProps) {
	if (loading) {
		return <p className="text-muted-foreground">正在加载标签……</p>;
	}
	if (failed) {
		return (
			<div className="flex flex-col items-start gap-2" role="alert">
				<p className="text-muted-foreground">标签加载失败。</p>
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					重试
				</Button>
			</div>
		);
	}
	if (options.length === 0) {
		return (
			<p className="text-muted-foreground">该项目下的用例还没有打过标签。</p>
		);
	}
	return (
		<ToggleGroup
			aria-label="按标签筛选"
			className="w-full flex-wrap"
			multiple={true}
			onValueChange={onChange}
			size="sm"
			value={selected}
			variant="outline"
		>
			{options.map((tag) => (
				<ToggleGroupItem key={tag} value={tag}>
					{tag}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

function tagTriggerLabel(count: number): string {
	return count === 0 ? "按标签筛选" : `按标签筛选，已选 ${count} 个`;
}

function TagFilterTriggerButton({ count }: { count: number }) {
	return (
		<Button aria-label={tagTriggerLabel(count)} type="button" variant="outline">
			<TagIcon data-icon="inline-start" />
			标签
			{count === 0 ? null : (
				<span className="numeric rounded-sm bg-muted px-1 text-muted-foreground text-xs">
					{count}
				</span>
			)}
		</Button>
	);
}

function useProjectTags(projectId: string) {
	const tagsQuery = useQuery(
		orpc.cases.listTags.queryOptions({ input: { projectId } })
	);
	const { refetch } = tagsQuery;
	const retry = useCallback(() => {
		refetch().catch(() => undefined);
	}, [refetch]);
	return {
		failed: tagsQuery.isError,
		loading: tagsQuery.isPending,
		options: tagsQuery.data ?? NO_TAGS,
		retry,
	};
}

interface CaseTagFilterProps {
	onChange: (tags: string[]) => void;
	projectId: string;
	tags: string[];
}

export function CaseTagFilter({
	onChange,
	projectId,
	tags,
}: CaseTagFilterProps) {
	const projectTags = useProjectTags(projectId);
	const clear = useCallback(() => onChange(NO_TAGS), [onChange]);

	return (
		<Popover>
			<PopoverTrigger render={<TagFilterTriggerButton count={tags.length} />} />
			<PopoverContent align="start">
				<TagOptions
					failed={projectTags.failed}
					loading={projectTags.loading}
					onChange={onChange}
					onRetry={projectTags.retry}
					options={projectTags.options}
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
