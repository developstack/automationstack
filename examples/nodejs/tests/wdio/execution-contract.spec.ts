/**
 * 被测的是两件事：`@automationstack/sdk` 把一轮结果**打包成请求体**的那一段
 * （`buildExecutionRequests` 的截断），以及附件通道的**第三段**——登记回执。
 *
 * 为什么放在 wdio 这一轮：它是三个框架里唯一有真浏览器的，而失败留现场
 * （真截图 + 日志）正是靠 `wdio.config.ts` 的 `afterTest` 挂上去的——
 * 本文件因此**一行 try/catch 都没有**，失败了自然有人替它拍照。
 *
 * ⚠️ 全文没有一行提到上报：不 new reporter、不 addResult、不 finish。
 */

import {
	buildExecutionRequests,
	MAX_INGEST_COMMENT_LENGTH,
	type ReporterConfig,
	resolveReporterConfig,
} from "@automationstack/sdk";
import { browser, expect } from "@wdio/globals";

import {
	describePresign,
	presignAttachments,
	putPresigned,
	registerAttachments,
} from "../../src/attachment-channel.ts";

/**
 * 全部是**占位值**，不读也不碰 `.env` 里的真 token：
 * 这一段测的是纯函数，真配置只有打服务端那一刻才需要。
 */
function fakeConfig(): ReporterConfig {
	return resolveReporterConfig({
		baseUrl: "https://qa.example.com/",
		env: {},
		idempotencyKey: "0e6ed0a1-4c9c-4f2f-9a1a-2f0e0d1c2b3a",
		projectId: "6a1c0b3e-2d4f-4a58-9c11-7e2d3f4a5b6c",
		token: "placeholder-token",
	});
}

/** 一张真 1×1 PNG。测的是通道，不是图像内容。 */
const ONE_PIXEL_PNG = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
		"base64"
	)
);

const HTTP_OK = 200;

describe("ingest 契约与附件通道", () => {
	before(async () => {
		// 真的开一个真浏览器打开真站点：这一轮的截图才有内容，
		// 也顺带证明这两个 spec 确实是在两个 worker 进程里跑的浏览器会话。
		await browser.url("/");
	});

	it("[AUTO-LOGIN-001] 过长的 message 在 SDK 侧就被截断，并留下说明", () => {
		const requests = buildExecutionRequests({
			config: fakeConfig(),
			results: [
				{
					durationMs: 12,
					message: "堆栈".repeat(5000),
					result: "failed",
					sourceRef: "AUTO-LOGIN-001",
				},
			],
			window: { finishedAt: null, startedAt: null },
		});

		const message = requests[0]?.results[0]?.message ?? "";
		expect(message.length).toBeLessThanOrEqual(MAX_INGEST_COMMENT_LENGTH);
		// 尾巴上必须留一句话说明被截了，否则人在失败清单上看到的是一句
		// 戛然而止的堆栈，会以为脚本自己就输出成那样。
		expect(message.endsWith("…（已截断，完整堆栈见 log 附件）")).toBe(true);
	});

	/**
	 * ⚠️ **这条是真的红，而且红得有出处。**
	 *
	 * `docs/phase3-automation-plan.md` 的「附件」验收组里这一条至今是 `[ ]`：
	 *
	 * > - [ ] 一条结果写进两个任务时，两边**各有一份**附件行与各自的 object
	 * >       （不共享 storageKey）
	 *
	 * 而紧跟着的「未验证项（2026-08-25）」点名了 `register` 回执「在真实服务端上
	 * 没跑过，只有单元测试里的假 transport 覆盖」。这条用例就是那条真的：
	 * presign → 直传 → 登记，一路走到附件行真的存在为止。
	 *
	 * 期望不与任何设计决定相抵触。R2 未配置时逐条降级（§5.6 / 第二期 D9）说的是
	 * 「传不上去不能拖垮整次上报」，那是**兜底**，不是终点；契约里 `storageConfigured`
	 * 这一位的存在本身就说明「配好了就该是 true」。配好 R2 这条自己会转绿。
	 */
	it("[AUTO-CART-002] 失败的截图和日志要一路走到附件行真的存在", async () => {
		const receipt = await presignAttachments([
			{
				contentType: "image/png",
				kind: "screenshot",
				sizeBytes: ONE_PIXEL_PNG.byteLength,
				sourceRef: "AUTO-CART-002",
			},
			{
				contentType: "text/plain",
				kind: "log",
				sizeBytes: 354,
				sourceRef: "AUTO-CART-002",
			},
		]);

		// jest 的 expect 不收第二个「说明」参数（收了直接抛），所以把两边都做成
		// 一句人话来比：红的时候 diff 里就是服务端的原文。
		expect(describePresign(receipt)).toEqual(
			"附件通道就绪：2 件全部签出了直传 URL"
		);

		const statuses = await Promise.all(
			receipt.uploads.map((upload) => putPresigned(upload, ONE_PIXEL_PNG))
		);
		expect(statuses).toEqual(receipt.uploads.map(() => HTTP_OK));

		const registered = await registerAttachments(
			receipt.uploads,
			(upload) => `AUTO-CART-002-${upload.index}`
		);
		expect(registered.registered.length).toEqual(receipt.uploads.length);
		// 同一条 sourceRef 落在多个 run_case 上时，key 规则里含 {runId}/{runCaseId}，
		// 所以每一份都必须是**各自独立的 object**，不共享 storageKey。
		const keys = new Set(registered.registered.map((row) => row.storageKey));
		expect(keys.size).toEqual(registered.registered.length);
	});

	/**
	 * 跳过的理由：切分本身在 `execution-batches.test.ts` 里已经逐条验过了，
	 * 这里再验一遍只是把同一件事换个框架重写。真正值得验的是「200 条以上分批在
	 * 真实服务端上走不走得通」——`docs/phase3-automation-plan.md` 那条
	 * 「未验证项（2026-08-25）：分批在真实链路上一次都没跑过」说的就是它。
	 * 但那需要往演示项目里灌 200 条以上的真实用例，超出这份示例的范围，
	 * 所以宁可显式跳过并写清楚，也不留一条假绿的。
	 *
	 * ⚠️ 用 `it.skip` 而不是在函数体里 `this.skip()`：后者会先触发 `test:start`
	 * 再触发 `test:pending`，而这两个事件在 `@wdio/reporter` 里拿到的 uid 不一样，
	 * 于是 `this.tests` 里会留下**两条** AUTO-PAY-003。汇聚到总控后一批里出现
	 * 重复 sourceRef，服务端直接 400「整批未受理」——六条结果一条都写不进去。
	 * 这不是推测，是这份示例第一次跑 wdio 时真踩到的。
	 */
	it.skip("[AUTO-PAY-003] 超过一批的结果按 200 条切开", () => {
		// 空的：这条用例的全部内容就是上面那段跳过理由。
	});
});
