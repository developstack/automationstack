import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RunVoidedBanner } from "@/components/test-runs/run-voided-banner";

const VOIDED_AT = new Date("2026-08-12T08:00:00Z");

describe("RunVoidedBanner：详情页显示由谁、在什么时间作废、原因", () => {
	it.each([
		["有原因", "张三", "用例范围选错了", "张三", "作废原因：用例范围选错了"],
		["没有原因时不显示原因", "张三", null, "张三", null],
		["作废人的账号已删除", null, null, "已删除的账号", null],
	])("%s", (_name, voidedByName, voidReason, actor, reasonText) => {
		render(
			<RunVoidedBanner
				voidedAt={VOIDED_AT}
				voidedByName={voidedByName}
				voidReason={voidReason}
			/>
		);
		const banner = screen.getByRole("status");
		expect(banner.textContent).toContain(`由 ${actor} 作废`);
		expect(banner.textContent).toContain("只能查看，不能修改");
		if (reasonText === null) {
			expect(banner.textContent).not.toContain("作废原因");
		} else {
			expect(banner.textContent).toContain(reasonText);
		}
	});
});
