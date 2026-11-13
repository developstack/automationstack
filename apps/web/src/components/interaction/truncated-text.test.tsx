import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TruncatedText } from "@/components/interaction/truncated-text";

const NAME = "登录/短信验证码/验证码过期后重新发送";
/** 比 Base UI Tooltip 悬停打开的延迟更长 */
const HOVER_WAIT_MS = 700;

/** jsdom 不排版。设定文字的全宽和可见宽度，模拟截断或完整显示。 */
function setTextWidths(element: HTMLElement, client: number, scroll: number) {
	Object.defineProperty(element, "clientWidth", { value: client });
	Object.defineProperty(element, "scrollWidth", { value: scroll });
}

const hover = (element: HTMLElement) => {
	fireEvent.pointerMove(element, { pointerType: "mouse" });
	fireEvent.pointerEnter(element, { pointerType: "mouse" });
	fireEvent.mouseEnter(element);
	fireEvent.mouseMove(element);
};

/** 打开的 Tooltip 弹层。Base UI 的弹层没有 tooltip 角色，关闭后也可能留在 DOM 中。 */
const tooltipContent = () =>
	document.querySelector<HTMLElement>(
		'[data-slot="tooltip-content"][data-open]'
	);

function wait(ms: number) {
	return act(() => new Promise((resolve) => setTimeout(resolve, ms)));
}

describe("TruncatedText：截断时悬停用 Tooltip 显示全文", () => {
	it.each([
		{ client: 80, interact: hover, name: "截断后悬停", shown: true },
		{ client: 200, interact: hover, name: "完整显示时悬停", shown: false },
		{
			client: 80,
			interact: (element: HTMLElement) => act(() => element.focus()),
			name: "截断后键盘聚焦",
			shown: false,
		},
	])("$name：显示提示 $shown", async ({ client, interact, shown }) => {
		render(<TruncatedText text={NAME} />);
		const text = screen.getByText(NAME);
		setTextWidths(text, client, 200);
		interact(text);
		await wait(HOVER_WAIT_MS);
		const tooltip = tooltipContent();
		expect(tooltip !== null).toBe(shown);
		if (shown) {
			expect(tooltip?.textContent).toBe(NAME);
		}
		expect(text.getAttribute("title")).toBeNull();
	});
});
