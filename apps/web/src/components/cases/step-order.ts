interface Ordered {
	id: string;
}

/** 把一步上移（delta 为 -1）或下移（delta 为 1）。越界时返回原数组。 */
export function moveStep<T extends Ordered>(
	steps: T[],
	id: string,
	delta: number
): T[] {
	const from = steps.findIndex((step) => step.id === id);
	return moveIndex(steps, from, from + delta);
}

/** 拖动结束：把拖动的一步放到目标步骤的位置。放回原位或放到列表外时返回原数组。 */
export function dropStep<T extends Ordered>(
	steps: T[],
	activeId: string,
	overId: string | null
): T[] {
	if (overId === null || overId === activeId) {
		return steps;
	}
	const from = steps.findIndex((step) => step.id === activeId);
	const to = steps.findIndex((step) => step.id === overId);
	return moveIndex(steps, from, to);
}

function moveIndex<T>(items: T[], from: number, to: number): T[] {
	if (from === -1 || to < 0 || to >= items.length || from === to) {
		return items;
	}
	const next = [...items];
	const [moved] = next.splice(from, 1);
	if (moved !== undefined) {
		next.splice(to, 0, moved);
	}
	return next;
}
