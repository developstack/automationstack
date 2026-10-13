import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { cn } from "@automationstack/ui/lib/utils";
import { ClipboardListIcon, FilterXIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

interface CaseEmptyProps {
	/** 是否选中了模块。没有选中模块时不能新建用例。 */
	canCreate: boolean;
	className?: string;
	filtered: boolean;
	onClearFilters: () => void;
	onCreate: () => void;
}

const SWAP_ICON = "absolute inset-0 size-5 transition-crossfade";

function CaseEmptyIcon({ filtered }: { filtered: boolean }) {
	return (
		<span className="relative block size-5">
			<FilterXIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-100" : "opacity-0")}
			/>
			<ClipboardListIcon
				aria-hidden={true}
				className={cn(SWAP_ICON, filtered ? "opacity-0" : "opacity-100")}
			/>
		</span>
	);
}

interface EmptyGuide {
	action: ReactNode;
	description: string;
	title: string;
}

function emptyGuide({
	canCreate,
	filtered,
	onClearFilters,
	onCreate,
}: CaseEmptyProps): EmptyGuide {
	if (filtered) {
		return {
			action: (
				<Button onClick={onClearFilters} size="sm" variant="outline">
					<FilterXIcon data-icon="inline-start" />
					清除筛选
				</Button>
			),
			description: "当前的筛选条件没有匹配的用例。请修改条件，或清除筛选。",
			title: "没有匹配的用例",
		};
	}
	if (canCreate) {
		return {
			action: (
				<Button onClick={onCreate} size="sm">
					<PlusIcon data-icon="inline-start" />
					新建用例
				</Button>
			),
			description: "这个模块和它的子模块下没有用例。新建第一条用例。",
			title: "还没有用例",
		};
	}
	return {
		action: null,
		description: "请先在左侧选择一个模块，然后在模块下新建用例。",
		title: "还没有用例",
	};
}

const EMPTY_ENTER_CLASS =
	"animate-in fade-in-0 slide-in-from-bottom-1 duration-200";

/** 列表为空和筛选无结果时的指引，显示在表格的位置。 */
export function CaseTableEmpty(props: CaseEmptyProps) {
	const { action, description, title } = emptyGuide(props);
	return (
		<Empty className={cn(EMPTY_ENTER_CLASS, props.className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CaseEmptyIcon filtered={props.filtered} />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action === null ? null : <EmptyContent>{action}</EmptyContent>}
		</Empty>
	);
}
