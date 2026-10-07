import assert from "node:assert/strict";
import test from "node:test";

import {
	describePresign,
	presignAttachments,
} from "../../src/attachment-channel.ts";

test("[AUTO-CART-002] 一条失败要能把截图和日志真的传上去", async () => {
	const receipt = await presignAttachments([
		{
			contentType: "image/png",
			kind: "screenshot",
			sizeBytes: 2345,
			sourceRef: "AUTO-CART-002",
		},
		{
			contentType: "text/plain",
			kind: "log",
			sizeBytes: 354,
			sourceRef: "AUTO-CART-002",
		},
	]);

	assert.equal(
		describePresign(receipt),
		"附件通道就绪：2 件全部签出了直传 URL"
	);
});
