import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useBeforeUnloadWarning } from "@/components/interaction/use-before-unload-warning";
import { renderRoutes } from "@/test-dom-fixtures";

function FormPage({ dirty }: { dirty: boolean }) {
	useBeforeUnloadWarning(dirty);
	return <p>表单页面</p>;
}

async function renderPage(dirty: boolean) {
	const view = renderRoutes({
		routes: {
			"/": () => <FormPage dirty={dirty} />,
			"/other": () => <p>别的页面</p>,
		},
	});
	await screen.findByText("表单页面");
	return view;
}

function unloadIsBlocked(): boolean {
	const event = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(event);
	return event.defaultPrevented;
}

afterEach(() => {
	window.history.replaceState(null, "", "/");
});

describe("useBeforeUnloadWarning：有未保存的修改时，关闭或刷新标签页由浏览器提醒", () => {
	it.each([
		["有修改时，浏览器关闭标签页前会提醒", true],
		["没有修改时不提醒", false],
	])("%s", async (_name, dirty) => {
		await renderPage(dirty);
		expect(unloadIsBlocked()).toBe(dirty);
	});

	it("站内跳转不拦截，由面板自己的关闭提醒处理", async () => {
		const { history } = await renderPage(true);
		act(() => history.push("/other"));
		expect(await screen.findByText("别的页面")).toBeDefined();
	});
});
