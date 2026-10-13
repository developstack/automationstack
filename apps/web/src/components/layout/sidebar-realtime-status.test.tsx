import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { SidebarRealtimeStatus } from "@/components/layout/sidebar-realtime-status";
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

function contextValue(status: RealtimeStatus): RealtimeContextValue {
	const presenceStore = new PresenceStore();
	presenceStore.apply({
		entries: [makeEntry("a", "alice"), makeEntry("b", "bob")],
		type: "presence:sync",
	});
	return { clientId: "self", connection: CONNECTION, presenceStore, status };
}

function wrap(value: RealtimeContextValue): ReactNode {
	return (
		<RealtimeContext.Provider value={value}>
			<SidebarRealtimeStatus />
		</RealtimeContext.Provider>
	);
}

const statusText = () => screen.getByRole("status").textContent;

describe("SidebarRealtimeStatus", () => {
	it("显示在线用户列表的人数", () => {
		render(wrap(contextValue("open")));
		expect(statusText()).toContain("2 人在线");
	});

	it("第一次连接成功之前的 closed：显示连接中，不闪出断开状态", () => {
		render(wrap(contextValue("closed")));
		expect(statusText()).toContain("正在连接实时协作");
	});

	it("连接成功后断开：重连期间一直显示断开", () => {
		const { rerender } = render(wrap(contextValue("open")));
		rerender(wrap(contextValue("closed")));
		expect(statusText()).toContain("实时协作已断开");
		rerender(wrap(contextValue("connecting")));
		expect(statusText()).toContain("实时协作已断开");
	});

	it("没有实时协作连接（项目还在加载）：显示连接中", () => {
		render(<SidebarRealtimeStatus />);
		expect(statusText()).toContain("正在连接实时协作");
	});
});
