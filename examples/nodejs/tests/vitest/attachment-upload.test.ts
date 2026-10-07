import { expect, test } from "vitest";

import {
	describePresign,
	presignAttachments,
	putPresigned,
} from "../../src/attachment-channel.ts";

const ONE_PIXEL_PNG = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
		"base64"
	)
);

const HTTP_OK = 200;

test("[AUTO-CART-002] 失败截图要真的躺在存储里，而不是只在本地", async () => {
	const receipt = await presignAttachments([
		{
			contentType: "image/png",
			kind: "screenshot",
			sizeBytes: ONE_PIXEL_PNG.byteLength,
			sourceRef: "AUTO-CART-002",
		},
	]);

	expect(describePresign(receipt), "直传的前置条件没满足").toBe(
		"附件通道就绪：1 件全部签出了直传 URL"
	);

	const statuses = await Promise.all(
		receipt.uploads.map((upload) => putPresigned(upload, ONE_PIXEL_PNG))
	);
	expect(statuses).toEqual(receipt.uploads.map(() => HTTP_OK));
});
