import { describe, expect, it, vi } from "vitest";

import type { EffectiveStorageSettings } from "../storage/settings-model";
import type { LocalObjectStorage } from "./local-storage";
import { composeObjectStorage, storagePartsOf } from "./object-storage";
import type { ObjectStorage } from "./object-storage-model";

vi.mock("@automationstack/env/server", () => ({ env: {} }));
vi.mock(
	"@automationstack/db/repositories/storage-settings-repository",
	() => ({})
);

function fakeStorage(name: string): ObjectStorage {
	return {
		caseImageUrl: (key) => Promise.resolve(`${name}:image:${key}`),
		headObject: () => Promise.resolve({ contentLength: 1, contentType: name }),
		presignDownload: (key) => Promise.resolve(`${name}:get:${key}`),
		presignUpload: (key) => Promise.resolve(`${name}:put:${key}`),
		remove: vi.fn(() => Promise.resolve()),
	};
}

function fakeLocal(keys: string[]): LocalObjectStorage {
	return {
		...fakeStorage("local"),
		has: (key) => Promise.resolve(keys.includes(key)),
	};
}

describe("composeObjectStorage：新文件写到 upload，已有的文件从它所在的地方读取", () => {
	const local = fakeLocal(["old-local.png"]);
	const r2 = fakeStorage("r2");

	it.each([
		["a file on local disk", "old-local.png", "local"],
		["a file that is not on local disk", "old-r2.png", "r2"],
	])("reads and removes %s from %s", async (_name, key, holder) => {
		const storage = composeObjectStorage({ local, r2, upload: local });
		await expect(storage.presignDownload(key)).resolves.toBe(
			`${holder}:get:${key}`
		);
		await expect(storage.caseImageUrl(key)).resolves.toBe(
			`${holder}:image:${key}`
		);
		await storage.remove(key);
		expect((holder === "local" ? local : r2).remove).toHaveBeenCalledWith(key);
	});

	it("without R2, every read uses local disk", async () => {
		const storage = composeObjectStorage({ local, r2: null, upload: local });
		await expect(storage.presignDownload("old-r2.png")).resolves.toBe(
			"local:get:old-r2.png"
		);
	});

	it("uploads and checks uploads on the upload backend", async () => {
		const storage = composeObjectStorage({ local, r2, upload: r2 });
		await expect(
			storage.presignUpload("new.png", {
				contentLength: 1,
				contentType: "image/png",
			})
		).resolves.toBe("r2:put:new.png");
		await expect(storage.headObject("new.png")).resolves.toMatchObject({
			contentType: "r2",
		});
	});
});

const COMPLETE_R2 = {
	accessKeyId: "id",
	bucket: "bucket",
	endpoint: "https://account.r2.example.test",
	publicBaseUrl: null,
	secretAccessKey: { present: true, value: "secret" },
};

function settings(
	backend: "local" | "r2",
	r2: EffectiveStorageSettings["r2"]
): EffectiveStorageSettings {
	return {
		backend,
		credentialProblem: null,
		r2,
		source: "database",
		updatedAt: null,
		updatedBy: null,
	};
}

describe("storagePartsOf", () => {
	const local = fakeLocal([]);

	it.each([
		[
			"local, no R2",
			settings("local", { ...COMPLETE_R2, bucket: null }),
			"local",
			false,
		],
		[
			"local, R2 kept for old files",
			settings("local", COMPLETE_R2),
			"local",
			true,
		],
		["r2, complete", settings("r2", COMPLETE_R2), "r2", true],
		[
			"r2, secret cannot be decrypted",
			settings("r2", {
				...COMPLETE_R2,
				secretAccessKey: { present: true, value: null },
			}),
			"local",
			false,
		],
	])("%s: uploads go to %s", (_name, value, upload, hasR2) => {
		const parts = storagePartsOf(value, local);
		expect(parts.upload === local ? "local" : "r2").toBe(upload);
		expect(parts.r2 !== null).toBe(hasR2);
	});
});
