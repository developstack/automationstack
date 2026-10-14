import { describe, expect, it } from "vitest";

import { decideModuleNameCommit } from "@/components/workspace/module-name-commit";

describe("decideModuleNameCommit：就地编辑模块名称时，Enter 和失去焦点各自怎么处理", () => {
	it("Enter：保存去掉首尾空格的新名称", () => {
		expect(decideModuleNameCommit("  下单流程 ", "", "enter")).toEqual({
			kind: "save",
			name: "下单流程",
		});
	});

	it("Enter：名称为空时不保存，在字段旁边提示原因", () => {
		expect(decideModuleNameCommit("   ", "", "enter")).toEqual({
			kind: "invalid",
			message: "请输入模块名称",
		});
	});

	it("失去焦点：名称为空时取消，不提示错误", () => {
		expect(decideModuleNameCommit("", "", "blur")).toEqual({ kind: "cancel" });
	});

	it("失去焦点：有新名称时保存", () => {
		expect(decideModuleNameCommit("支付", "", "blur")).toEqual({
			kind: "save",
			name: "支付",
		});
	});

	it("重命名时名称没有变化：取消，不发请求", () => {
		expect(decideModuleNameCommit(" 支付 ", "支付", "enter")).toEqual({
			kind: "cancel",
		});
		expect(decideModuleNameCommit("支付", "支付", "blur")).toEqual({
			kind: "cancel",
		});
	});
});
