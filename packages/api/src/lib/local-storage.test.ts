import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	contentTypeForKey,
	createLocalStorage,
	isSafeStorageKey,
	writeLocalObject,
} from "./local-storage";
import { runWithRequestOrigin } from "./request-origin";

vi.mock("@automationstack/env/server", () => ({
	env: { SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789" },
}));

const KEY = "test-cases/p/c/1b4e28ba-2fa1-11d2-883f-0016d3cca427.png";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "local-storage-"));
});

afterEach(async () => {
	await rm(root, { force: true, recursive: true });
});

function streamOf(text: string) {
	return new Blob([text]).stream();
}

describe("对象键和类型", () => {
	it.each([
		[KEY, true],
		["test-runs/p/r/c/screenshot-x.webm", true],
		["../etc/passwd", false],
		["test-cases/../x.png", false],
		["test-cases/.hidden", false],
		["/absolute.png", false],
		["a//b.png", false],
		["a/b c.png", false],
		["", false],
	])("isSafeStorageKey(%j) is %s", (storageKey, safe) => {
		expect(isSafeStorageKey(storageKey)).toBe(safe);
	});

	it.each([
		["a.png", "image/png"],
		["a.JPG", "image/jpeg"],
		["a.webp", "image/webp"],
		["a.mp4", "video/mp4"],
		["a.webm", "video/webm"],
		["a.txt", "text/plain"],
		["a.bin", "application/octet-stream"],
		["a.html", "application/octet-stream"],
	])("contentTypeForKey(%s) is %s", (storageKey, contentType) => {
		expect(contentTypeForKey(storageKey)).toBe(contentType);
	});
});

describe("writeLocalObject", () => {
	it("writes the file only when the size is exactly the declared size", async () => {
		const storage = createLocalStorage(root);
		await expect(
			writeLocalObject({
				body: streamOf("abcd"),
				expectedBytes: 4,
				root,
				storageKey: KEY,
			})
		).resolves.toEqual({ kind: "ok" });
		await expect(storage.headObject(KEY)).resolves.toEqual({
			contentLength: 4,
			contentType: "image/png",
		});
		expect(await readFile(path.join(root, KEY), "utf8")).toBe("abcd");
	});

	it.each([
		["shorter", "abc", 3],
		["longer", "abcde", 5],
	])(
		"a %s body is refused and leaves no file",
		async (_name, body, received) => {
			await expect(
				writeLocalObject({
					body: streamOf(body),
					expectedBytes: 4,
					root,
					storageKey: KEY,
				})
			).resolves.toEqual({ kind: "size-mismatch", receivedBytes: received });
			expect(await readdir(path.dirname(path.join(root, KEY)))).toEqual([]);
		}
	);
});

describe("createLocalStorage", () => {
	it("has, headObject and remove follow the file on disk", async () => {
		const storage = createLocalStorage(root);
		await expect(storage.has(KEY)).resolves.toBe(false);
		await expect(storage.headObject(KEY)).resolves.toBeNull();
		await writeLocalObject({
			body: streamOf("x"),
			expectedBytes: 1,
			root,
			storageKey: KEY,
		});
		await expect(storage.has(KEY)).resolves.toBe(true);
		await storage.remove(KEY);
		await expect(storage.has(KEY)).resolves.toBe(false);
		await expect(storage.remove(KEY)).resolves.toBeUndefined();
	});

	it("addresses use the origin of the request and the /files/ path", async () => {
		const storage = createLocalStorage(root);
		const urls = await runWithRequestOrigin("https://test.example.com", () =>
			Promise.all([
				storage.presignUpload(KEY, {
					contentLength: 4,
					contentType: "image/png",
				}),
				storage.caseImageUrl(KEY),
				storage.presignDownload(KEY),
			])
		);
		const [upload, caseImage, download] = urls.map((url) => new URL(url));
		for (const url of [upload, caseImage, download]) {
			expect(url?.origin).toBe("https://test.example.com");
			expect(url?.pathname).toBe(`/files/${KEY}`);
		}
		expect(upload?.searchParams.get("size")).toBe("4");
		expect(caseImage?.searchParams.has("expires")).toBe(false);
		expect(download?.searchParams.has("expires")).toBe(true);
	});

	it("refuses to sign an upload for an unsafe key", async () => {
		const storage = createLocalStorage(root);
		await expect(
			storage.presignUpload("../x.png", {
				contentLength: 1,
				contentType: "image/png",
			})
		).rejects.toThrow("对象键不安全");
	});
});
