import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MindmapLoadError } from "./mindmap-load-error.tsx";

function query(error: Error | null, isFetching = false) {
	return {
		error,
		isError: error !== null,
		isFetching,
		refetch: vi.fn(() => Promise.resolve()),
	};
}

describe("MindmapLoadError：脑图加载失败时显示原因，可以重试", () => {
	it("显示服务端的原因，重试只重新加载失败的查询", () => {
		const project = query(null);
		const tree = query(new Error("模块不存在或不属于该项目"));
		render(<MindmapLoadError project={project} tree={tree} />);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("脑图加载失败");
		expect(alert.textContent).toContain("模块不存在或不属于该项目");

		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(tree.refetch).toHaveBeenCalledOnce();
		expect(project.refetch).not.toHaveBeenCalled();
	});

	it("项目和脑图都失败时，两个都重新加载", () => {
		const project = query(new Error("项目不存在"));
		const tree = query(new Error("项目不存在"));
		render(<MindmapLoadError project={project} tree={tree} />);

		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(project.refetch).toHaveBeenCalledOnce();
		expect(tree.refetch).toHaveBeenCalledOnce();
	});

	it("重新加载时重试按钮显示加载状态", () => {
		render(
			<MindmapLoadError
				project={query(null)}
				tree={query(new Error("x"), true)}
			/>
		);
		expect(
			screen.getByRole("button", { name: "重试" }).getAttribute("aria-busy")
		).toBe("true");
	});
});
