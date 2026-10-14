import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { HeaderRealtimeStatus } from "@/components/layout/header-realtime-status";
import type { RealtimeConnection, RealtimeStatus } from "@/realtime/connection";
import { PresenceStore } from "@/realtime/presence-store";
import {
	RealtimeContext,
	type RealtimeContextValue,
} from "@/realtime/realtime-context";

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

const TWO_USERS = [makeEntry("a", "alice"), makeEntry("b", "bob")];

function contextValue(
	status: RealtimeStatus,
	entries: PresenceEntry[] = TWO_USERS
): RealtimeContextValue {
	const presenceStore = new PresenceStore();
	presenceStore.apply({ entries, type: "presence:sync" });
	return { clientId: "a", connection: CONNECTION, presenceStore, status };
}

function wrap(value: RealtimeContextValue): ReactNode {
	return (
		<RealtimeContext.Provider value={value}>
			<HeaderRealtimeStatus />
		</RealtimeContext.Provider>
	);
}

const statusRegion = () => screen.getByRole("status");

describe("HeaderRealtimeStatus", () => {
	it("已连接：显示在线人数，状态区域读出连接状态", () => {
		render(wrap(contextValue("open")));
		expect(screen.getByText("2 人在线")).toBeDefined();
		expect(statusRegion().dataset.tone).toBe("online");
		expect(statusRegion().textContent).toContain("实时协作已连接");
		expect(statusRegion().textContent).toContain("2 人在线");
	});

	it("鼠标悬停显示完整文字，但 title 不放在状态区域上，避免屏幕阅读器读两遍；头像不在状态区域里", () => {
		render(wrap(contextValue("open")));
		expect(screen.getByTitle("实时协作已连接，2 人在线")).toBeDefined();
		expect(statusRegion().hasAttribute("title")).toBe(false);
		const avatar = screen.getByRole("button", { name: "alice（我） · 列表" });
		expect(statusRegion().contains(avatar)).toBe(false);
	});

	it.each([
		["第一次连接成功之前的 closed：显示连接中", "closed"],
		["没有实时协作连接（项目还在加载）：显示连接中", null],
	] as const)("%s", (_name, status) => {
		render(
			status === null ? <HeaderRealtimeStatus /> : wrap(contextValue(status))
		);
		expect(screen.getByText("连接中")).toBeDefined();
		expect(statusRegion().dataset.tone).toBe("connecting");
		expect(statusRegion().textContent).toContain("正在连接实时协作");
	});

	it("连接成功后断开：重连期间一直显示已断开和重连说明", () => {
		const { rerender } = render(wrap(contextValue("open")));
		rerender(wrap(contextValue("closed")));
		rerender(wrap(contextValue("connecting")));
		expect(screen.getByText("已断开")).toBeDefined();
		expect(statusRegion().dataset.tone).toBe("offline");
		expect(statusRegion().textContent).toContain(
			"实时协作已断开，其他人的修改暂时不会同步，正在自动重连"
		);
	});

	it("只有已连接时显示扩散的呼吸圈，并且只在允许动效时显示", () => {
		const { rerender } = render(wrap(contextValue("open")));
		const ring = () =>
			statusRegion().querySelector<HTMLElement>(
				'[aria-hidden="true"] [class*="animate-"]'
			);
		// jsdom 不计算样式：圈默认 hidden，只在 .online 组内且 motion-safe 时显示。
		expect(ring()?.classList).toContain("hidden");
		expect(ring()?.classList).toContain(
			"motion-safe:group-[.online]:inline-flex"
		);
		expect(statusRegion().classList).toContain("online");
		rerender(wrap(contextValue("closed")));
		expect(statusRegion().classList).not.toContain("online");
		expect(statusRegion().classList).toContain("offline");
	});

	it("同一个用户的两个标签页只算一人", () => {
		render(
			wrap(
				contextValue("open", [
					makeEntry("a", "alice"),
					makeEntry("a2", "alice"),
					makeEntry("b", "bob"),
				])
			)
		);
		expect(screen.getByText("2 人在线")).toBeDefined();
	});
});
