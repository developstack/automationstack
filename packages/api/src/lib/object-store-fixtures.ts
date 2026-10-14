import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";

export const VALID_HEAD: AttachmentObjectHead = {
	contentLength: 1024,
	contentType: "image/png",
};

export interface FakeStore extends AttachmentObjectStore {
	calls: string[];
}

/** 记录每次调用的假对象存储。HeadObject 总是返回 head。 */
export function createStore(
	head: AttachmentObjectHead | null = VALID_HEAD
): FakeStore {
	const calls: string[] = [];
	return {
		calls,
		headObject: (storageKey) => {
			calls.push(`headObject:${storageKey}`);
			return Promise.resolve(head);
		},
		remove: (storageKey) => {
			calls.push(`remove:${storageKey}`);
			return Promise.resolve();
		},
	};
}
