/**
 * 被测对象：附件通道的**第二段**——拿 presign 回来的 URL 真的把字节 PUT 上去。
 *
 * ⚠️ **这条是真的红，而且红得有出处。**
 *
 * `docs/phase3-automation-plan.md` 的「附件」验收组下面那段「未验证项
 * （2026-08-25）」写着：
 *
 * > 预签名 PUT、`register` 回执、分块上传在真实服务端上**都没跑过**，
 * > 只有单元测试里的假 transport 覆盖。本组前四条在配好 R2 之前不具备打勾条件。
 *
 * 「假 transport 绿着」和「这条路真的走得通」是两件事——这个文件就是那条真的。
 * 它此刻断在第一段（R2 没配，一件都签不出来），失败信息是服务端的原话。
 *
 * 期望本身不与任何设计决定相抵触：§7.3 / D28「谁都不用引 AWS SDK」正是说
 * 附件靠**预签名 PUT** 上传；这条断言要的就是那句承诺此刻成立。
 *
 * ⚠️ 本文件里没有一行 SDK 的上报动作：不 new reporter、不 addResult、不 finish。
 */

import { expect, test } from "vitest";

import {
	describePresign,
	presignAttachments,
	putPresigned,
} from "../../src/attachment-channel.ts";

/** 一张真 1×1 PNG。测的是通道，不是图像内容，所以够小就行。 */
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

	// 直传这一段的前置条件：得先有一个签好的位置。没有就把服务端原话带出来，
	// 而不是让下一行崩在 `undefined.uploadUrl` 上——那种堆栈什么都说明不了。
	expect(describePresign(receipt), "直传的前置条件没满足").toBe(
		"附件通道就绪：1 件全部签出了直传 URL"
	);

	// contentType 必须逐字用签名时那一个：它进了签名的 SignedHeaders，
	// 改一个字母 R2 就回 403 SignatureDoesNotMatch。
	const statuses = await Promise.all(
		receipt.uploads.map((upload) => putPresigned(upload, ONE_PIXEL_PNG))
	);
	expect(statuses).toEqual(receipt.uploads.map(() => HTTP_OK));
});
