import { vi } from "vitest";

/**
 * 用例列表批量操作栏的测试替身：测试文件用 vi.mock 把 @/utils/orpc 换成 orpcMock。
 * 这个文件不引用任何组件，所以 vi.mock 的工厂函数引用它时不会形成循环引用。
 */

export const api = {
	changeStatus: vi.fn<(input: unknown) => Promise<unknown>>(),
	moduleTree: vi.fn<() => Promise<unknown>>(),
	moveImpact: vi.fn<(input: unknown) => Promise<unknown>>(),
	moveMany: vi.fn<(input: unknown) => Promise<unknown>>(),
	removeMany: vi.fn<(input: unknown) => Promise<unknown>>(),
};

function mutation(mutationFn: (input: unknown) => Promise<unknown>) {
	return {
		mutationOptions: (options: object) => ({ ...options, mutationFn }),
	};
}

export const orpcMock = {
	orpc: {
		cases: {
			changeStatus: mutation(api.changeStatus),
			key: () => ["cases"],
			list: { key: () => ["cases", "list"] },
			moveImpact: mutation(api.moveImpact),
			moveMany: mutation(api.moveMany),
			removeMany: mutation(api.removeMany),
			undoStatusChange: { mutationOptions: (options: object) => options },
		},
		mindmap: { key: () => ["mindmap"] },
		modules: {
			tree: {
				queryOptions: () => ({
					queryFn: api.moduleTree,
					queryKey: ["modules", "tree"],
				}),
			},
		},
	},
};
