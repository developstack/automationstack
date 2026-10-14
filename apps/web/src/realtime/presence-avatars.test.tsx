import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RealtimeConnection } from "./connection";
import { PresenceAvatars } from "./presence-avatars";
import { PresenceStore } from "./presence-store";
import { RealtimeContext } from "./realtime-context";

const CONNECTION = {} as RealtimeConnection;

function makeEntry(clientId: string, name: string): PresenceEntry {
	return {
		clientId,
		color: "#111111",
		editingCaseId: null,
		joinedAt: 1000,
		name,
		page: null,
		view: "list",
		viewingCaseId: null,
	};
}

function renderAvatars(entries: PresenceEntry[], clientId = "self") {
	const presenceStore = new PresenceStore();
	presenceStore.apply({ entries, type: "presence:sync" });
	return render(
		<RealtimeContext.Provider
			value={{
				clientId,
				connection: CONNECTION,
				presenceStore,
				status: "open",
			}}
		>
			<PresenceAvatars />
		</RealtimeContext.Provider>
	);
}

const avatarTriggers = (container: HTMLElement) =>
	container.querySelectorAll<HTMLElement>("[data-presence-avatar]");

describe("PresenceAvatars", () => {
	it("7 个用户：显示 5 个头像和「+2」，「+2」的名称列出隐藏的用户", () => {
		const entries = ["a", "b", "c", "d", "e", "f", "g"].map((name) =>
			makeEntry(`tab-${name}`, name)
		);
		const { container } = renderAvatars(entries);
		expect(avatarTriggers(container)).toHaveLength(5);
		expect(screen.getByText("+2")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "还有 2 人在线：f、g" })
		).toBeDefined();
	});

	it("自己在隐藏的用户里时，「+N」的名称也标注「（我）」", () => {
		const entries = ["a", "b", "c", "d", "e", "f"].map((name) =>
			makeEntry(`tab-${name}`, name)
		);
		// 自己最后加入，排在名单末尾，落在隐藏的用户里。
		const self = { ...makeEntry("self", "me"), joinedAt: 2000 };
		renderAvatars([...entries, self]);
		expect(
			screen.getByRole("button", { name: "还有 2 人在线：f、me（我）" })
		).toBeDefined();
	});

	it("同一个用户的多个标签页只显示一个头像", () => {
		const { container } = renderAvatars([
			makeEntry("tab-1", "alice"),
			makeEntry("tab-2", "alice"),
			makeEntry("tab-3", "bob"),
		]);
		expect(avatarTriggers(container)).toHaveLength(2);
		// 没有「+N」：只有两个头像按钮。
		expect(screen.getAllByRole("button")).toHaveLength(2);
	});

	it("头像的可访问名称有姓名和所在页面，可以用键盘聚焦；自己的头像标注「（我）」", () => {
		renderAvatars([makeEntry("other", "bob"), makeEntry("self", "me")]);
		const trigger = screen.getByRole("button", { name: "bob · 列表" });
		trigger.focus();
		expect(document.activeElement).toBe(trigger);
		expect(
			screen.getByRole("button", { name: "me（我） · 列表" })
		).toBeDefined();
	});
});
