import { RESERVED_NODE_NAME_MESSAGE } from "@automationstack/api/schemas/farm";
import { describe, expect, it } from "vitest";
import {
	formatLastSeenAt,
	NODE_BACKEND_LABELS,
	nodeOnlineLabel,
	validateMaxSlots,
	validateNodeName,
} from "@/components/farm-nodes/farm-node-meta";

describe("validateNodeName", () => {
	it("合法值返回 null", () => {
		expect(validateNodeName("工位 A 的 Mac mini")).toBeNull();
		expect(validateNodeName(" build-box-01 ")).toBeNull();
	});

	it("空值与纯空格都算空", () => {
		expect(validateNodeName("")).toBe("节点名不能为空");
		expect(validateNodeName("   ")).toBe("节点名不能为空");
	});

	it("超长按 trim 之后的长度算，上限与服务端的 64 对齐", () => {
		expect(validateNodeName(`  ${"n".repeat(64)}  `)).toBeNull();
		expect(validateNodeName("n".repeat(65))).toBe("节点名最多 64 个字符");
	});

	// 表单要在提交前就拦下保留名，否则服务端那句拒绝会被 oRPC 包成 Input validation failed
	it("保留名 local 就地拒，文案与服务端共用同一个常量", () => {
		expect(validateNodeName("local")).toBe(RESERVED_NODE_NAME_MESSAGE);
		expect(validateNodeName("  LOCAL  ")).toBe(RESERVED_NODE_NAME_MESSAGE);
	});

	it("只是含有 local 的名字照常放行", () => {
		expect(validateNodeName("local-mac-mini")).toBeNull();
	});
});

describe("validateMaxSlots", () => {
	it("边界内的整数返回 null", () => {
		expect(validateMaxSlots("1")).toBeNull();
		expect(validateMaxSlots("2")).toBeNull();
		expect(validateMaxSlots(" 64 ")).toBeNull();
	});

	it("空框单独一句话，不跟「要填整数」混为一谈", () => {
		expect(validateMaxSlots("")).toBe("槽位上限不能为空");
		expect(validateMaxSlots("  ")).toBe("槽位上限不能为空");
	});

	// 这三样转成 number 之后会一起塌成 NaN，分不开就给不出不同的提示
	it("小数与非数字都归到「要填整数」", () => {
		expect(validateMaxSlots("1.5")).toBe("槽位上限要填整数");
		expect(validateMaxSlots("abc")).toBe("槽位上限要填整数");
	});

	it("越界两头都挡，上下限与服务端的 1..64 对齐", () => {
		expect(validateMaxSlots("0")).toBe("槽位上限要在 1–64 之间");
		expect(validateMaxSlots("-3")).toBe("槽位上限要在 1–64 之间");
		expect(validateMaxSlots("65")).toBe("槽位上限要在 1–64 之间");
	});
});

describe("formatLastSeenAt", () => {
	const NOW = new Date("2026-09-01T12:00:00.000Z").getTime();
	const agoBy = (ms: number) => new Date(NOW - ms);

	it("从没上报过给一句明话", () => {
		expect(formatLastSeenAt(null, NOW)).toBe("从未上报");
	});

	it("不足一秒与未来时间戳都说「刚刚」", () => {
		expect(formatLastSeenAt(agoBy(0), NOW)).toBe("刚刚");
		expect(formatLastSeenAt(agoBy(999), NOW)).toBe("刚刚");
		expect(formatLastSeenAt(new Date(NOW + 5000), NOW)).toBe("刚刚");
	});

	it("逐级进位：秒 → 分钟 → 小时 → 天", () => {
		expect(formatLastSeenAt(agoBy(1000), NOW)).toBe("1 秒前");
		expect(formatLastSeenAt(agoBy(59_000), NOW)).toBe("59 秒前");
		expect(formatLastSeenAt(agoBy(60_000), NOW)).toBe("1 分钟前");
		expect(formatLastSeenAt(agoBy(59 * 60_000), NOW)).toBe("59 分钟前");
		expect(formatLastSeenAt(agoBy(60 * 60_000), NOW)).toBe("1 小时前");
		expect(formatLastSeenAt(agoBy(23 * 60 * 60_000), NOW)).toBe("23 小时前");
		expect(formatLastSeenAt(agoBy(24 * 60 * 60_000), NOW)).toBe("1 天前");
		expect(formatLastSeenAt(agoBy(9 * 24 * 60 * 60_000), NOW)).toBe("9 天前");
	});

	// 数据经过 dehydrate → hydrate 之后可能是 ISO 字符串而不是 Date
	it("收字符串时间戳", () => {
		expect(formatLastSeenAt("2026-09-01T11:58:00.000Z", NOW)).toBe("2 分钟前");
	});
});

describe("展示文案", () => {
	it("后端说人话，不把 local/docker 直接摆出来", () => {
		expect(NODE_BACKEND_LABELS.local).toBe("本机 Chrome");
		expect(NODE_BACKEND_LABELS.docker).toBe("Docker 容器");
	});

	it("在线状态有可念的字，不只是一个颜色", () => {
		expect(nodeOnlineLabel(true)).toBe("在线");
		expect(nodeOnlineLabel(false)).toBe("离线");
	});
});
