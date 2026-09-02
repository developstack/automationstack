/**
 * 产物下载地址的三种存储形态各钉一遍。
 *
 * 值得测的原因是它的失效方式**全都不报错**：拼错前缀、忘了剥掉工作目录、把
 * 「没配 R2」当成 local 去拼一条 farm 根本供不出来的路径——每一种的表现都是
 * 详情页上一个点下去 404 的按钮，而用户会以为产物丢了。tsc 对这些一言不发。
 */
import { describe, expect, it } from "vitest";

import {
	buildLocalFarmArtifactUrl,
	type FarmArtifactDownloadContext,
	readFarmArtifactStorage,
	resolveFarmArtifactDownloadUrl,
} from "./farm-artifact-download";

const SESSION_ID = "7f1c2a90-0000-4000-8000-000000000001";

/** 配了 R2 的平台：签名函数把 key 原样回显，断言里好认。 */
const configured: FarmArtifactDownloadContext = {
	farmPublicUrl: "http://localhost:3002",
	presignR2Download: (storageKey) =>
		Promise.resolve(`https://r2.example/signed/${storageKey}?sig=x`),
	sessionId: SESSION_ID,
};

/** 没配 R2 的平台（本地开发的常态）。 */
const notConfigured: FarmArtifactDownloadContext = {
	...configured,
	presignR2Download: null,
};

describe("readFarmArtifactStorage：只认约定的两个取值", () => {
	it("认得 r2 与 local", () => {
		expect(readFarmArtifactStorage({ storage: "r2" })).toBe("r2");
		expect(readFarmArtifactStorage({ storage: "local" })).toBe("local");
	});

	it("认不出来的一律 null，不猜", () => {
		expect(readFarmArtifactStorage(null)).toBeNull();
		expect(readFarmArtifactStorage(undefined)).toBeNull();
		expect(readFarmArtifactStorage("local")).toBeNull();
		expect(readFarmArtifactStorage({ entries: 12 })).toBeNull();
		expect(readFarmArtifactStorage({ storage: "s3" })).toBeNull();
	});
});

describe("buildLocalFarmArtifactUrl：只拼文件名那一段", () => {
	it("剥掉工作目录，不把服务器路径暴露进 URL", () => {
		expect(
			buildLocalFarmArtifactUrl(
				"http://localhost:3002",
				SESSION_ID,
				`/tmp/automationstack-farm/${SESSION_ID}/har.json`
			)
		).toBe(`http://localhost:3002/artifacts/${SESSION_ID}/har.json`);
	});

	it("公开地址带尾斜杠时不拼出双斜杠", () => {
		expect(
			buildLocalFarmArtifactUrl(
				"http://farm.example/",
				SESSION_ID,
				"shot-3.png"
			)
		).toBe(`http://farm.example/artifacts/${SESSION_ID}/shot-3.png`);
	});
});

describe("resolveFarmArtifactDownloadUrl：三种存储形态", () => {
	it("local：拼 farm 的静态地址，与 R2 配没配无关", async () => {
		const url = await resolveFarmArtifactDownloadUrl(
			{
				meta: { storage: "local" },
				storageKey: `/tmp/automationstack-farm/${SESSION_ID}/console.ndjson`,
			},
			notConfigured
		);
		expect(url).toBe(
			`http://localhost:3002/artifacts/${SESSION_ID}/console.ndjson`
		);
	});

	it("r2：配了就现签一条 GET URL", async () => {
		const url = await resolveFarmArtifactDownloadUrl(
			{ meta: { entries: 42, storage: "r2" }, storageKey: "farm/s1/har.json" },
			configured
		);
		expect(url).toBe("https://r2.example/signed/farm/s1/har.json?sig=x");
	});

	it("r2 但平台没配 R2：null，不能回落成本地路径", async () => {
		const url = await resolveFarmArtifactDownloadUrl(
			{ meta: { storage: "r2" }, storageKey: "farm/s1/har.json" },
			notConfigured
		);
		expect(url).toBeNull();
	});

	it("认不出的 storage：null，不拿 storageKey 硬拼", async () => {
		const unknownStorage = await resolveFarmArtifactDownloadUrl(
			{ meta: { storage: "s3" }, storageKey: "farm/s1/har.json" },
			configured
		);
		const missingMeta = await resolveFarmArtifactDownloadUrl(
			{ meta: null, storageKey: "farm/s1/har.json" },
			configured
		);
		expect(unknownStorage).toBeNull();
		expect(missingMeta).toBeNull();
	});
});
