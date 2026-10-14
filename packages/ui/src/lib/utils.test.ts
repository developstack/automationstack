import { describe, expect, it } from "vitest";

import { cn } from "./utils";

const TYPE_SCALE = ["page-title", "card-title", "body", "caption"] as const;

describe("cn", () => {
	it.each(TYPE_SCALE)(
		"text-%s 是字号：和文字颜色一起保留，和其他字号冲突时后者生效",
		(size) => {
			expect(cn(`text-${size}`, "text-muted-foreground")).toBe(
				`text-${size} text-muted-foreground`
			);
			expect(cn(`text-${size}`, "text-sm")).toBe("text-sm");
			expect(cn("text-sm", `text-${size}`)).toBe(`text-${size}`);
		}
	);

	it.each(["card", "popover"])(
		"阴影令牌 shadow-%s 是阴影，和其他阴影冲突时后者生效",
		(name) => {
			expect(cn(`shadow-${name}`, "shadow-none")).toBe("shadow-none");
			expect(cn(`shadow-${name}`, "shadow-black/10")).toBe(
				`shadow-${name} shadow-black/10`
			);
		}
	);
});
