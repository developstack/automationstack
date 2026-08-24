/**
 * 草稿存储层单测用的 Storage 替身。
 *
 * vitest 的 web project 跑在 node 环境（见根 vitest.config.ts），没有 window，
 * 所以这里自己搭一个最小的 Storage 挂上去。用真的行为（`key(index)` 按插入顺序、
 * `getItem` 返回 null）而不是把 `localStore()` mock 掉：被测的恰恰是「怎么遍历、
 * 怎么算键、怎么迁移」这一层，把 Storage 换成 mock 等于把被测对象也换掉了。
 *
 * 单独一个文件而不是各测试里各抄一份：`case-draft-storage.test.ts` 与
 * `case-draft-migration.test.ts` 都要用（单文件 300 行的上限逼着它们分家），
 * 两份替身一旦行为不一致，两边的结论就没法互相印证了。
 */

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

/**
 * Safari 隐私模式：光是访问 localStorage 的成员就抛。
 *
 * 单独一个子类而不是给 FakeStorage 加个开关——开关是个只在外部赋值的布尔量，
 * 类型会被收窄成字面量，类里的判断反而会被 lint 判成恒假。
 */
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

/** 把替身挂成全局 window.localStorage，返回它好让测试直接摆/查键。 */
export function installStorage(store: Storage = new FakeStorage()): Storage {
	// node 环境里没有 window，直接造一个只带 localStorage 的替身。
	(globalThis as { window?: unknown }).window = { localStorage: store };
	return store;
}

/** 每个用例跑完把 window 摘掉，免得测试之间互相串。 */
export function uninstallStorage(): void {
	(globalThis as { window?: unknown }).window = undefined;
}
