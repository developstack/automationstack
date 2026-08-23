/**
 * Shared renderers for word-level diff output (`TextDiffSegment[]` from
 * `diff-segments.ts`): inline ins/del marks plus the compact "old → new"
 * pair used by the scalar field rows.
 */
import { cn } from "@automationstack/ui/lib/utils";
import { ArrowRightIcon } from "lucide-react";

import type { TextDiffSegment, TextDiffSegmentKind } from "./diff-segments.ts";

export const ADDED_TEXT_CLASS =
	"bg-emerald-500/15 text-emerald-700 no-underline dark:text-emerald-300";
export const REMOVED_TEXT_CLASS =
	"bg-rose-500/15 text-rose-700 line-through dark:text-rose-300";

interface KeyedSegment {
	key: string;
	kind: TextDiffSegmentKind;
	text: string;
}

/**
 * Builds keys from the running character offset instead of the array
 * index, so React keys stay meaningful without `noArrayIndexKey` hacks.
 */
function keySegments(segments: readonly TextDiffSegment[]): KeyedSegment[] {
	const keyed: KeyedSegment[] = [];
	let offset = 0;
	for (const segment of segments) {
		keyed.push({
			key: `${offset}:${segment.kind}`,
			kind: segment.kind,
			text: segment.text,
		});
		offset += segment.text.length;
	}
	return keyed;
}

function DiffSegment({ segment }: { segment: KeyedSegment }) {
	if (segment.kind === "added") {
		return <ins className={ADDED_TEXT_CLASS}>{segment.text}</ins>;
	}
	if (segment.kind === "removed") {
		return <del className={REMOVED_TEXT_CLASS}>{segment.text}</del>;
	}
	return <span>{segment.text}</span>;
}

interface TextDiffProps {
	className?: string;
	/** Rendered when both sides are empty. */
	emptyText?: string;
	segments: readonly TextDiffSegment[];
}

/** Renders word diff segments as inline `<ins>` / `<del>` marks. */
export function TextDiff({ className, emptyText, segments }: TextDiffProps) {
	const keyed = keySegments(segments).filter(
		(segment) => segment.text.length > 0
	);
	if (keyed.length === 0) {
		return (
			<span className="text-muted-foreground text-xs">
				{emptyText ?? "（空）"}
			</span>
		);
	}
	return (
		<p
			className={cn(
				"whitespace-pre-wrap break-words text-xs leading-relaxed",
				className
			)}
		>
			{keyed.map((segment) => (
				<DiffSegment key={segment.key} segment={segment} />
			))}
		</p>
	);
}

interface OldNewValueProps {
	newText: string;
	oldText: string;
}

/** Compact "old → new" pair for short scalar values. */
export function OldNewValue({ newText, oldText }: OldNewValueProps) {
	return (
		<span className="flex flex-wrap items-center gap-1.5 text-xs">
			<del className={REMOVED_TEXT_CLASS}>{oldText}</del>
			<ArrowRightIcon
				aria-hidden="true"
				className="icon-stroke-regular size-3 shrink-0 text-muted-foreground"
			/>
			<ins className={ADDED_TEXT_CLASS}>{newText}</ins>
		</span>
	);
}
