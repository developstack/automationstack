import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { HTTP_PAYLOAD_TOO_LARGE } from "./responses";

/**
 * ingest 三条 POST 端点的请求体硬上限。
 *
 * 这是拿一枚 token 就能打的外部端点，body 里带着任意多条结果和任意长的 message。
 * 没有这道闸，一个把整个日志目录 POST 上来的 SDK bug 会让 `JSON.parse` 去啃一个
 * 几十 MB 的字符串——那是在解析之前就该被拒的东西，不该先花掉一次全量解析。
 * 注意它挡不了「合法但巨大」以外的东西：契约层自己的上限
 * （`MAX_INGEST_RESULTS_PER_REQUEST` / `MAX_INGEST_MESSAGE_LENGTH`）仍然在
 * handler 的 zod 里，那些才是能指着字段名说话的 400。
 */

/**
 * 结论上报的上限，取 16 MiB：真实的一轮上报（几百到两千条结果、每条 message
 * 几百字节）离它有两个数量级的余量。理论上「2000 条 × 每条 20000 字符」能撑破它，
 * 但那种请求本来就该分批——§5.5 给 SDK 的建议正是每批 200 条，413 的文案也照这个说。
 */
export const MAX_INGEST_BODY_BYTES = 16 * 1024 * 1024;

/**
 * 附件两个端点的请求体硬上限。**刻意比结论那条小一个数量级。**
 *
 * 关键事实：这两条端点的 body 里**没有一个文件字节**。附件本体是 SDK 拿着
 * 预签名 URL 直传 R2 的（§5.6 / D28），走的根本不是这个进程。这里流过的只有
 * 元数据——presign 是 `{sourceRef, kind, contentType, sizeBytes}`，
 * register 是 `{runId, runCaseId, storageKey, fileName, kind}`。
 * 复用 16 MiB 会让人误以为「附件大 = body 大」，那正是以后有人把文件塞进
 * base64 字段时不会被拦下的那个误解。
 *
 * 取 4 MiB 的算法：契约的硬闸是一次
 * `MAX_INGEST_ATTACHMENTS_PER_REQUEST`（2000）条，单条里最长的字段是
 * `sourceRef`（512 字符，全中文按 UTF-8 算 1536 字节），加上其余字段与 JSON
 * 标点约 1.7 KB —— 塞满契约上限的一次请求约 3.4 MB。4 MiB 刚好盖住它：
 * **凡是契约本身会受理的请求都不会先撞上 413**，于是超限时上报方拿到的仍是
 * 一条指着字段名说话的 400，而不是一句「太大了」。再往上就纯属给畸形请求
 * 留解析预算了。
 */
export const MAX_INGEST_ATTACHMENT_BODY_BYTES = 4 * 1024 * 1024;

interface IngestBodyLimitOptions {
	/** 拼在「请求体超过 N 字节；」后面的那半句：告诉上报方接下来该怎么做。 */
	advice: string;
	maxSize: number;
}

/**
 * 413 的文案统一在这里拼：前半句（超了多少）三条端点一模一样，后半句
 * （接下来怎么办）各不相同——结论那条是「分批重发」，附件那两条要先说清
 * 「附件本体根本不走这个端点」，否则人只会去把文件切小，而那和这道闸无关。
 */
export function ingestBodyLimit(
	options: IngestBodyLimitOptions
): MiddlewareHandler {
	return bodyLimit({
		maxSize: options.maxSize,
		onError: (c) =>
			c.json(
				{
					error: "payload-too-large",
					message: `请求体超过 ${options.maxSize} 字节；${options.advice}`,
				},
				HTTP_PAYLOAD_TOO_LARGE
			),
	});
}
