/**
 * 被测对象：**此刻在跑的这台服务端**的附件通道第一段——`POST /ingest/attachments/presign`。
 *
 * ⚠️ **这条是真的红，而且红得有出处。**
 *
 * `docs/phase3-automation-plan.md` 的「附件」验收组里第一条至今是 `[ ]`：
 *
 * > - [ ] token 走的 presign 路由可用，写入 `uploadedVia = 'automation'`
 *
 * 紧跟着的那段「未验证项（2026-08-25）」把原因写死了：这台开发服务端的 R2 没配，
 * `presign` 一律返回 `storageConfigured: false`，示例每次都只走到降级分支。
 *
 * 所以这条断言的期望——**「附件通道此刻是通的」**——不跟 SDK 或服务端的任何一个
 * 设计决定相抵触：R2 未配置时优雅降级（§5.6 / 第二期 D9）是**降级**，不是目的地。
 * 契约里专门留了 `storageConfigured` 这一位，就是给调用方判「这套环境到底能不能用」的。
 * 配好 R2，这条自己会转绿，那个 `[ ]` 也就有资格打勾了。
 *
 * ⚠️ 全文没有一行提到上报：不 new reporter、不 addResult、不 finish。
 * 结果怎么到平台上的，见 `adapters/node-test-reporter.ts`。
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
	describePresign,
	presignAttachments,
} from "../../src/attachment-channel.ts";

test("[AUTO-CART-002] 一条失败要能把截图和日志真的传上去", async () => {
	// 一条失败自带截图 + 日志是常态，契约也刻意允许同一条 sourceRef 重复出现
	// （结论只能有一个，附件天然是多件）。这里就照最常见的那一对申请。
	const receipt = await presignAttachments([
		{
			contentType: "image/png",
			kind: "screenshot",
			sizeBytes: 2345,
			sourceRef: "AUTO-CART-002",
		},
		{
			// 逐字用 SDK 自己给 log 的默认值。带 `; charset=utf-8` 会被服务端
			// 的白名单当场拒掉（「log 不支持 text/plain; charset=utf-8」），
			// 那是一条独立于 R2 的规则，别在这里混进来。
			contentType: "text/plain",
			kind: "log",
			sizeBytes: 354,
			sourceRef: "AUTO-CART-002",
		},
	]);

	// 期望值与实际值都是一句人话：红的时候 diff 里直接就是服务端的原文，
	// 不用再去翻日志找那份对账单。
	assert.equal(
		describePresign(receipt),
		"附件通道就绪：2 件全部签出了直传 URL"
	);
});
