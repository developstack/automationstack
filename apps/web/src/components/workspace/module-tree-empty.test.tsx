import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModuleTreeEmpty } from "@/components/workspace/module-tree-empty";

describe("ModuleTreeEmpty：项目还没有模块时给出下一步", () => {
	it("说明模块的用途，点击「新建模块」开始在树中输入名称", () => {
		const onCreateRoot = vi.fn();
		render(<ModuleTreeEmpty onCreateRoot={onCreateRoot} />);
		expect(screen.getByText("暂无模块")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "新建模块" }));
		expect(onCreateRoot).toHaveBeenCalledOnce();
	});
});
