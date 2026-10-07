import { describe, expect, it } from "vitest";

import {
	evictUserFromRoom,
	getClient,
	joinRoom,
	type RoomSocket,
} from "./rooms";

const OPEN_READY_STATE = 1;

interface FakeSocket extends RoomSocket {
	closed: boolean;
	sent: string[];
}

function fakeSocket(): FakeSocket {
	const socket: FakeSocket = {
		close: () => {
			socket.closed = true;
		},
		closed: false,
		readyState: OPEN_READY_STATE,
		send: (data: string) => {
			socket.sent.push(data);
		},
		sent: [],
	};
	return socket;
}

function join(projectId: string, clientId: string, userId: string): FakeSocket {
	const socket = fakeSocket();
	joinRoom(projectId, {
		entry: {
			clientId,
			color: "#000000",
			editingCaseId: null,
			joinedAt: Date.now(),
			name: userId,
			page: null,
			view: "list",
			viewingCaseId: null,
		},
		lastSeen: Date.now(),
		socket,
		userId,
	});
	return socket;
}

describe("evictUserFromRoom", () => {
	it("踢掉该用户在该项目内的全部标签页，并关闭每一条连接", () => {
		const projectId = "p-multi-tab";
		const first = join(projectId, "tab-1", "u-removed");
		const second = join(projectId, "tab-2", "u-removed");

		expect(evictUserFromRoom(projectId, "u-removed")).toBe(2);
		expect(first.closed).toBe(true);
		expect(second.closed).toBe(true);
		expect(getClient(projectId, "tab-1")).toBeNull();
		expect(getClient(projectId, "tab-2")).toBeNull();
	});

	it("同房间的其他人一条都不受影响", () => {
		const projectId = "p-bystander";
		join(projectId, "tab-1", "u-removed");
		const bystander = join(projectId, "tab-2", "u-stays");

		evictUserFromRoom(projectId, "u-removed");
		expect(bystander.closed).toBe(false);
		expect(getClient(projectId, "tab-2")).not.toBeNull();
	});

	it("同一个人在别的项目里的连接不受影响——撤销是按项目发生的", () => {
		const other = join("p-other", "tab-1", "u-removed");
		join("p-target", "tab-2", "u-removed");

		evictUserFromRoom("p-target", "u-removed");
		expect(other.closed).toBe(false);
		expect(getClient("p-other", "tab-1")).not.toBeNull();
	});

	it("剩下的人会收到那个人的 presence:leave，不会留下幽灵头像", () => {
		const projectId = "p-leave-broadcast";
		join(projectId, "tab-1", "u-removed");
		const bystander = join(projectId, "tab-2", "u-stays");

		evictUserFromRoom(projectId, "u-removed");
		expect(bystander.sent.map((raw) => JSON.parse(raw))).toContainEqual({
			clientId: "tab-1",
			type: "presence:leave",
		});
	});

	it("房间不存在 / 那个人不在房间里时是无操作，不抛", () => {
		expect(evictUserFromRoom("p-never-existed", "u-removed")).toBe(0);
		join("p-noop", "tab-1", "u-stays");
		expect(evictUserFromRoom("p-noop", "u-removed")).toBe(0);
		expect(getClient("p-noop", "tab-1")).not.toBeNull();
	});
});
