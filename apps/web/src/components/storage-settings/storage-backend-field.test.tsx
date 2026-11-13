import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StorageBackendField } from "@/components/storage-settings/storage-backend-field";

function renderField(pending = false) {
	const onChange = vi.fn();
	render(
		<StorageBackendField onChange={onChange} pending={pending} value="local" />
	);
	return onChange;
}

describe("StorageBackendField：选择存储方式", () => {
	it("两个单选项有名称和说明；当前的值被选中；点另一个选项报告新的值", () => {
		const onChange = renderField();
		const group = screen.getByRole("radiogroup", { name: "存储方式" });
		expect(group).toBeDefined();
		const local = screen.getByRole("radio", { name: "服务器本地" });
		const r2 = screen.getByRole("radio", { name: "Cloudflare R2" });
		expect(local.getAttribute("aria-checked")).toBe("true");
		expect(r2.getAttribute("aria-checked")).toBe("false");
		expect(r2.getAttribute("aria-describedby")).not.toBeNull();
		fireEvent.click(r2);
		expect(onChange).toHaveBeenCalledWith("r2");
	});

	it("保存中：不能选择", () => {
		const onChange = renderField(true);
		const r2 = screen.getByRole("radio", { name: "Cloudflare R2" });
		expect(r2.getAttribute("aria-disabled")).toBe("true");
		fireEvent.click(r2);
		expect(onChange).not.toHaveBeenCalled();
	});
});
