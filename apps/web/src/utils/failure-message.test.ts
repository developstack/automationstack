import { describe, expect, it } from "vitest";

import { failureMessage } from "@/utils/failure-message";

describe("failureMessage：失败提示说明原因", () => {
	it("有操作名时，写成「操作失败：原因」", () => {
		expect(failureMessage("删除项目", new Error("项目不存在"))).toBe(
			"删除项目失败：项目不存在"
		);
	});

	it("没有操作名时，只显示原因", () => {
		expect(failureMessage(undefined, new Error("项目不存在"))).toBe(
			"项目不存在"
		);
	});

	it("错误没有说明时，给出可以理解的原因", () => {
		const blank = Object.assign(new Error("原因"), { message: " " });
		expect(failureMessage("删除模块", blank)).toBe(
			"删除模块失败：网络异常或服务暂时不可用，请稍后重试"
		);
	});

	it("浏览器的网络错误改为中文原因", () => {
		expect(failureMessage("保存设置", new TypeError("Failed to fetch"))).toBe(
			"保存设置失败：网络异常或服务暂时不可用，请稍后重试"
		);
	});

	it("不是 Error 的值也给出原因", () => {
		expect(failureMessage("删除用例", "boom")).toBe(
			"删除用例失败：网络异常或服务暂时不可用，请稍后重试"
		);
	});
});
