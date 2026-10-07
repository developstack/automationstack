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
import { ClipboardListIcon, FilterXIcon } from "lucide-react";

interface CaseEmptyProps {
	className?: string;
	filtered: boolean;
	onClearFilters: () => void;
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

const EMPTY_ENTER_CLASS =
	"animate-in fade-in-0 slide-in-from-bottom-1 duration-200";

export function CaseTableEmpty({
	className,
	filtered,
	onClearFilters,
}: CaseEmptyProps) {
	return (
		<Empty className={cn(EMPTY_ENTER_CLASS, className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CaseEmptyIcon filtered={filtered} />
				</EmptyMedia>
				<EmptyTitle>{filtered ? "没有匹配的用例" : "还没有用例"}</EmptyTitle>
				<EmptyDescription>
					{filtered
						? "当前筛选条件没有命中任何用例，换个条件或清除筛选试试。"
						: "这个范围下还没有用例，点击右上角「新建用例」开始。"}
				</EmptyDescription>
			</EmptyHeader>
			{filtered ? (
				<EmptyContent>
					<Button onClick={onClearFilters} size="sm" variant="outline">
						清除筛选
					</Button>
				</EmptyContent>
			) : null}
		</Empty>
	);
}
