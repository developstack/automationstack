import { describe, expect, it, vi } from "vitest";

import { MAX_CASE_IMAGE_BYTES } from "./case-attachment-policy";
import type { ObjectStorage } from "./object-storage-model";
import {
	copyStepImagesToCase,
	removeCopiedImages,
} from "./step-adoption-images";

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CASE_ID = "77777777-7777-4777-8777-777777777777";
const KEY_PREFIX = `test-cases/${PROJECT_ID}/${CASE_ID}/`;

interface FakeAttachment {
	contentType: string;
	fileName: string;
	sizeBytes: number;
	storageKey: string;
}

function attachment(
	name: string,
	contentType = "image/png",
	sizeBytes = 100
): FakeAttachment {
	return {
		contentType,
		fileName: name,
		sizeBytes,
		storageKey: `test-runs/${name}`,
	};
}

function sourceOf(attachments: FakeAttachment[]) {
	return { attachments, caseId: CASE_ID, projectId: PROJECT_ID };
}

/** 存储中有 files 里的对象；其他对象读出 null。 */
function fakeStorage(files: Record<string, Uint8Array>) {
	return {
		readObject: vi.fn((key: string) => Promise.resolve(files[key] ?? null)),
		remove: vi.fn(() => Promise.resolve()),
		writeObject: vi.fn(() => Promise.resolve()),
	} as unknown as ObjectStorage & {
		remove: ReturnType<typeof vi.fn>;
		writeObject: ReturnType<typeof vi.fn>;
	};
}

function filesFor(attachments: FakeAttachment[], byteLength = 3) {
	return Object.fromEntries(
		attachments.map((item) => [item.storageKey, new Uint8Array(byteLength)])
	);
}

describe("copyStepImagesToCase：把实际附件中的图片复制为用例图片", () => {
	it("copies usable images in order, and takes the size from the copied bytes", async () => {
		const items = [
			attachment("a.png", "image/png", 999),
			attachment("b.jpg", "image/jpeg"),
			attachment("c.webp", "image/webp"),
		];
		const storage = fakeStorage(
			Object.fromEntries(
				items.map((item, index) => [item.storageKey, new Uint8Array(index + 5)])
			)
		);
		const { images, skipped } = await copyStepImagesToCase(
			storage,
			sourceOf(items)
		);
		expect(skipped).toBe(0);
		expect(images.map((image) => image.fileName)).toEqual([
			"a.png",
			"b.jpg",
			"c.webp",
		]);
		expect(images.map((image) => image.sizeBytes)).toEqual([5, 6, 7]);
		expect(images.map((image) => image.contentType)).toEqual([
			"image/png",
			"image/jpeg",
			"image/webp",
		]);
		for (const image of images) {
			expect(image.storageKey.startsWith(KEY_PREFIX)).toBe(true);
		}
		expect(images.map((image) => image.storageKey.split(".").pop())).toEqual([
			"png",
			"jpg",
			"webp",
		]);
		expect(storage.writeObject).toHaveBeenCalledTimes(3);
		expect(storage.writeObject).toHaveBeenCalledWith(
			images[0]?.storageKey,
			expect.any(Uint8Array),
			"image/png"
		);
	});

	it.each([
		["a video", attachment("v.mp4", "video/mp4")],
		["a log", attachment("l.txt", "text/plain")],
		["a gif", attachment("g.gif", "image/gif")],
		[
			"an image over 10 MiB",
			attachment("big.png", "image/png", MAX_CASE_IMAGE_BYTES + 1),
		],
	])("skips %s and counts it", async (_name, skippedItem) => {
		const items = [attachment("ok.png"), skippedItem];
		const storage = fakeStorage(filesFor(items));
		const { images, skipped } = await copyStepImagesToCase(
			storage,
			sourceOf(items)
		);
		expect(images.map((image) => image.fileName)).toEqual(["ok.png"]);
		expect(skipped).toBe(1);
		expect(storage.readObject).not.toHaveBeenCalledWith(skippedItem.storageKey);
	});

	it("copies an image of exactly 10 MiB", async () => {
		const items = [attachment("edge.png", "image/png", MAX_CASE_IMAGE_BYTES)];
		const { images, skipped } = await copyStepImagesToCase(
			fakeStorage(filesFor(items)),
			sourceOf(items)
		);
		expect(images).toHaveLength(1);
		expect(skipped).toBe(0);
	});

	it("copies at most 9 images and counts the rest as skipped", async () => {
		const items = Array.from({ length: 11 }, (_, index) =>
			attachment(`${index}.png`)
		);
		const storage = fakeStorage(filesFor(items));
		const { images, skipped } = await copyStepImagesToCase(
			storage,
			sourceOf(items)
		);
		expect(images.map((image) => image.fileName)).toEqual(
			items.slice(0, 9).map((item) => item.fileName)
		);
		expect(skipped).toBe(2);
		expect(storage.writeObject).toHaveBeenCalledTimes(9);
	});

	it("skips a source file that is no longer in storage", async () => {
		const items = [attachment("gone.png"), attachment("here.png")];
		const storage = fakeStorage({
			"test-runs/here.png": new Uint8Array(4),
		});
		const { images, skipped } = await copyStepImagesToCase(
			storage,
			sourceOf(items)
		);
		expect(images.map((image) => image.fileName)).toEqual(["here.png"]);
		expect(skipped).toBe(1);
		expect(storage.writeObject).toHaveBeenCalledTimes(1);
	});

	it("removes the files that were already copied and rethrows when one write fails", async () => {
		const items = [
			attachment("a.png"),
			attachment("b.png"),
			attachment("c.png"),
		];
		const storage = fakeStorage(filesFor(items));
		const failure = new Error("disk full");
		storage.writeObject.mockImplementation(
			(_key: string, _body: Uint8Array, _type: string) =>
				storage.writeObject.mock.calls.length === 2
					? Promise.reject(failure)
					: Promise.resolve()
		);
		await expect(copyStepImagesToCase(storage, sourceOf(items))).rejects.toBe(
			failure
		);
		const written = storage.writeObject.mock.calls.map(([key]) => key);
		const removed = storage.remove.mock.calls.map(([key]) => key);
		expect(removed).toHaveLength(2);
		expect(removed.every((key: string) => written.includes(key))).toBe(true);
	});
});

describe("removeCopiedImages：删除复制的文件", () => {
	it("removes every file and ignores remove failures", async () => {
		const storage = fakeStorage({});
		storage.remove.mockImplementation((key: string) =>
			key === "k1" ? Promise.reject(new Error("gone")) : Promise.resolve()
		);
		const images = ["k1", "k2"].map((storageKey) => ({
			contentType: "image/png",
			fileName: storageKey,
			sizeBytes: 1,
			storageKey,
		}));
		await expect(removeCopiedImages(storage, images)).resolves.toBeUndefined();
		expect(storage.remove).toHaveBeenCalledTimes(2);
		expect(storage.remove).toHaveBeenCalledWith("k2");
	});
});
