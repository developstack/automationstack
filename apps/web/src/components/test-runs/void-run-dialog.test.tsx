import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VoidRunDialog } from "@/components/test-runs/void-run-dialog";

const mutate = vi.fn();

vi.mock("@/components/test-runs/use-test-run-list-mutations", () => ({
	useVoidTestRun: () => ({ isPending: false, mutate }),
}));

const RUN_ID = "44444444-4444-4444-8444-444444444444";

function renderDialog(onClose = vi.fn()) {
	render(
		<VoidRunDialog
			onClose={onClose}
			open={true}
			runId={RUN_ID}
			runName="回归测试"
		/>
	);
	return onClose;
}

beforeEach(() => {
	mutate.mockClear();
});

describe("VoidRunDialog：作废前确认，原因选填", () => {
	it.each([
		["不填原因", "", null],
		["填了原因", "  重复创建  ", "重复创建"],
	])("%s：点「作废测试任务」后作废", (_name, typed, reason) => {
		renderDialog();
		fireEvent.change(screen.getByLabelText("作废原因（选填）"), {
			target: { value: typed },
		});
		fireEvent.click(screen.getByRole("button", { name: "作废测试任务" }));
		expect(mutate).toHaveBeenCalledWith({ reason, runId: RUN_ID });
	});

	it("点「返回」关闭弹窗，不作废", () => {
		const onClose = renderDialog();
		fireEvent.click(screen.getByRole("button", { name: "返回" }));
		expect(onClose).toHaveBeenCalled();
		expect(mutate).not.toHaveBeenCalled();
	});
});
