/**
 * 节点名的校验，重点钉住**保留名**那一条。
 *
 * 单独开一个测试文件而不是塞进别处：这条规则的真相源在另一个包之外
 * （`apps/farm/src/nodes/source-registry.ts` 的 `BUILTIN_SOURCE_NAME`），
 * 两边靠注释互指、没有类型约束。真出现漂移时，症状是会话安静地跑错机器，
 * 不会有任何报错——所以要有一条测试在这里替它喊一声。
 */
import { describe, expect, it } from "vitest";

import {
	createFarmNodeSchema,
	RESERVED_NODE_NAME,
	RESERVED_NODE_NAME_MESSAGE,
	updateFarmNodeSchema,
} from "./farm";

const VALID_ID = "00000000-0000-4000-8000-000000000000";

function createWithName(name: string) {
	return createFarmNodeSchema.safeParse({ backend: "local", name });
}

function updateWithName(name: string) {
	return updateFarmNodeSchema.safeParse({ id: VALID_ID, name });
}

describe("保留名", () => {
	it("保留名就是 farm 内建伪节点那个 local", () => {
		expect(RESERVED_NODE_NAME).toBe("local");
	});

	it("create 拒绝保留名", () => {
		const result = createWithName(RESERVED_NODE_NAME);

		expect(result.success).toBe(false);
	});

	it("update 也拒绝保留名——改名同样能撞上", () => {
		const result = updateWithName(RESERVED_NODE_NAME);

		expect(result.success).toBe(false);
	});

	it("拒绝时给的是那句人话，前端拿它直接显示", () => {
		const result = createWithName(RESERVED_NODE_NAME);

		expect(result.error?.issues[0]?.message).toBe(RESERVED_NODE_NAME_MESSAGE);
	});

	it("大小写变形一并拒——人眼里它们是同一个名字", () => {
		expect(createWithName("Local").success).toBe(false);
		expect(createWithName("LOCAL").success).toBe(false);
	});

	it("前后空白先被 trim 掉，再去撞保留名", () => {
		expect(createWithName("  local  ").success).toBe(false);
	});

	it("只是**含有** local 的名字放行——撞的是整个名字，不是子串", () => {
		expect(createWithName("local-mac-mini").success).toBe(true);
		expect(createWithName("我的 local 机器").success).toBe(true);
	});
});

describe("节点名的其余约束", () => {
	it("空名与纯空白都拒", () => {
		expect(createWithName("").success).toBe(false);
		expect(createWithName("   ").success).toBe(false);
	});

	it("64 个字放行，65 个拒", () => {
		expect(createWithName("a".repeat(64)).success).toBe(true);
		expect(createWithName("a".repeat(65)).success).toBe(false);
	});

	it("update 里 name 可以整条不传", () => {
		const result = updateFarmNodeSchema.safeParse({ id: VALID_ID });

		expect(result.success).toBe(true);
	});
});
