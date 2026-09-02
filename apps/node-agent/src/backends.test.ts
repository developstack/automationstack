import { describe, expect, it } from "vitest";

import { detectBackends } from "./backends";

describe("detectBackends", () => {
	it("daemon 可达时上报两种后端", async () => {
		await expect(detectBackends(() => Promise.resolve(true))).resolves.toEqual([
			"local",
			"docker",
		]);
	});

	it("daemon 不可达只降能力，不报错", async () => {
		await expect(detectBackends(() => Promise.resolve(false))).resolves.toEqual(
			["local"]
		);
	});

	it("探测本身抛异常（socket 不存在、权限不足）同样只降能力", async () => {
		await expect(
			detectBackends(() => Promise.reject(new Error("EACCES")))
		).resolves.toEqual(["local"]);
	});
});
