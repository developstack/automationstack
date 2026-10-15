import type { ChangeKind } from "./change-kind.ts";

/** 一张步骤截图在两个版本之间的变化。截图没有「修改」，内容不同的图片是另一个附件。 */
export type ScreenshotChangeKind = Exclude<ChangeKind, "modified">;

export interface ScreenshotDiffEntry {
	id: string;
	kind: ScreenshotChangeKind;
}

/** 最长公共子序列中的 id。这些截图的相对顺序没有改变。 */
function keptInOrder(
	oldIds: readonly string[],
	newIds: readonly string[]
): Set<string> {
	const lengths = Array.from({ length: oldIds.length + 1 }, () =>
		new Array<number>(newIds.length + 1).fill(0)
	);
	for (let i = oldIds.length - 1; i >= 0; i -= 1) {
		for (let j = newIds.length - 1; j >= 0; j -= 1) {
			lengths[i][j] =
				oldIds[i] === newIds[j]
					? lengths[i + 1][j + 1] + 1
					: Math.max(lengths[i + 1][j], lengths[i][j + 1]);
		}
	}
	const kept = new Set<string>();
	let i = 0;
	let j = 0;
	while (i < oldIds.length && j < newIds.length) {
		if (oldIds[i] === newIds[j]) {
			kept.add(oldIds[i]);
			i += 1;
			j += 1;
		} else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
			i += 1;
		} else {
			j += 1;
		}
	}
	return kept;
}

/**
 * 一个步骤的截图变化。先按新版本的顺序列出新增、移动和未变的截图，再按旧版本的顺序列出删除的截图。
 * 「移动」只标记相对顺序改变的截图：删除或新增一张截图不会让其他截图变成「移动」。
 */
export function diffScreenshots(
	oldIds: readonly string[],
	newIds: readonly string[]
): ScreenshotDiffEntry[] {
	const oldSet = new Set(oldIds);
	const newSet = new Set(newIds);
	const kept = keptInOrder(
		oldIds.filter((id) => newSet.has(id)),
		newIds.filter((id) => oldSet.has(id))
	);
	const current = newIds.map(
		(id): ScreenshotDiffEntry => ({
			id,
			kind: newKind(id, oldSet, kept),
		})
	);
	const removed = oldIds
		.filter((id) => !newSet.has(id))
		.map((id): ScreenshotDiffEntry => ({ id, kind: "removed" }));
	return [...current, ...removed];
}

function newKind(
	id: string,
	oldSet: ReadonlySet<string>,
	kept: ReadonlySet<string>
): ScreenshotChangeKind {
	if (!oldSet.has(id)) {
		return "added";
	}
	return kept.has(id) ? "unchanged" : "moved";
}

export function hasScreenshotChanges(
	entries: readonly ScreenshotDiffEntry[]
): boolean {
	return entries.some((entry) => entry.kind !== "unchanged");
}
