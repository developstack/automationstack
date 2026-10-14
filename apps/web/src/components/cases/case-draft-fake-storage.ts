import { emptyCaseFormValues } from "@/components/cases/case-meta";

export class FakeStorage implements Storage {
	private readonly map = new Map<string, string>();

	get length(): number {
		return this.map.size;
	}

	clear(): void {
		this.map.clear();
	}

	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.map.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.map.delete(key);
	}

	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
}

export class HostileStorage extends FakeStorage {
	override get length(): number {
		throw new Error("storage disabled");
	}

	override getItem(): string | null {
		throw new Error("storage disabled");
	}

	override removeItem(): void {
		throw new Error("storage disabled");
	}

	override setItem(): void {
		throw new Error("storage disabled");
	}
}

export function installStorage(store: Storage = new FakeStorage()): Storage {
	(globalThis as { window?: unknown }).window = { localStorage: store };
	return store;
}

export function uninstallStorage(): void {
	(globalThis as { window?: unknown }).window = undefined;
}

/** 草稿在 localStorage 里的键。新格式的后缀是 caseId，老格式的后缀是 moduleId。 */
export function caseDraftKey(projectId: string, suffix: string): string {
	return `automationstack.case-draft.${projectId}.${suffix}`;
}

/** 在 key 下写入一份老格式的草稿：名称是「老草稿」，savedAt 是 100，patch 可以覆盖。 */
export function seedLegacyCaseDraft(
	store: Storage,
	key: string,
	patch: Record<string, unknown>
): void {
	store.setItem(
		key,
		JSON.stringify({
			attachments: [],
			savedAt: 100,
			values: { ...emptyCaseFormValues(), name: "老草稿" },
			...patch,
		})
	);
}
