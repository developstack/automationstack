import { cn } from "@automationstack/ui/lib/utils";

import { DiffMark } from "./diff-mark.tsx";
import type { TextDiffSegment, TextDiffSegmentKind } from "./diff-segments.ts";

interface KeyedSegment {
	key: string;
	kind: TextDiffSegmentKind;
	text: string;
}

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
	if (segment.kind === "unchanged") {
		return <span>{segment.text}</span>;
	}
	return <DiffMark kind={segment.kind}>{segment.text}</DiffMark>;
}

interface TextDiffProps {
	className?: string;
	emptyText?: string;
	segments: readonly TextDiffSegment[];
}

export function TextDiff({ className, emptyText, segments }: TextDiffProps) {
	const keyed = keySegments(segments).filter(
		(segment) => segment.text.length > 0
	);
	if (keyed.length === 0) {
		return (
			<span className="text-muted-foreground text-sm">
				{emptyText ?? "（空）"}
			</span>
		);
	}
	return (
		<p
			className={cn(
				"whitespace-pre-wrap break-words text-sm leading-relaxed",
				className
			)}
		>
			{keyed.map((segment) => (
				<DiffSegment key={segment.key} segment={segment} />
			))}
		</p>
	);
}
