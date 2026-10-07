import { EventEmitter } from "node:events";

import type { InvalidateEvent } from "./protocol";

const BUS_EVENT_NAME = "realtime:invalidate";

const MEMBERSHIP_REVOKED_EVENT_NAME = "realtime:membership-revoked";

const MAX_BUS_LISTENERS = 32;

export type RealtimeBusListener = (
	projectId: string,
	event: InvalidateEvent
) => void;

export type MembershipRevokedListener = (
	projectId: string,
	userId: string
) => void;

export class RealtimeBus extends EventEmitter {
	constructor() {
		super();
		this.setMaxListeners(MAX_BUS_LISTENERS);
	}

	publish(projectId: string, event: InvalidateEvent): void {
		this.emit(BUS_EVENT_NAME, projectId, event);
	}

	subscribe(listener: RealtimeBusListener): () => void {
		this.on(BUS_EVENT_NAME, listener);
		return () => {
			this.off(BUS_EVENT_NAME, listener);
		};
	}

	publishMembershipRevoked(projectId: string, userId: string): void {
		this.emit(MEMBERSHIP_REVOKED_EVENT_NAME, projectId, userId);
	}

	subscribeMembershipRevoked(listener: MembershipRevokedListener): () => void {
		this.on(MEMBERSHIP_REVOKED_EVENT_NAME, listener);
		return () => {
			this.off(MEMBERSHIP_REVOKED_EVENT_NAME, listener);
		};
	}
}

export const realtimeBus = new RealtimeBus();
