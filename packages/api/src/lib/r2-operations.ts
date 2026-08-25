import { env } from "@automationstack/env/server";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	NotFound,
	PutObjectCommand,
	S3Client,
	S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { AttachmentObjectHead } from "./attachment-ingest";
import {
	DOWNLOAD_URL_TTL_SECONDS,
	UPLOAD_URL_TTL_SECONDS,
} from "./attachment-policy";

/**
 * 对单个 R2 对象的四种动作，每种一个自由函数：建客户端、读属性、签两种 URL、删。
 *
 * 与 `./r2.ts` 分开的理由是**两层关心的东西不同**：那边回答「有没有配、配了就
 * 复用同一个客户端」（进程级的一次性决策），这边回答「一次调用怎么发」。
 * 混在一个闭包里时，`createStorage` 的返回对象里塞满了四个方法的完整实现，
 * 「客户端怎么建」被埋在中间，而那恰恰是唯一会被 `R2_ENDPOINT` 改写的部分。
 *
 * 这些函数**不缓存、不判断是否已配置**：显式收 `client` 与 `bucket`，
 * 于是既能被 `./r2.ts` 的缓存句柄复用，也能在测试里对着一个临时客户端直接调。
 */

/** HTTP「对象不存在」。 */
const NOT_FOUND_STATUS = 404;

/**
 * HeadObject 的「对象不存在」判定。
 *
 * 除了 SDK 建模的 `NotFound`，还认 404 状态码：HTTP HEAD 没有响应体，
 * SDK 能否把错误反序列化成 `NotFound` 取决于 R2 回了哪些响应头，
 * 而 R2 终究不是 S3。补认状态码，避免「对象不存在」在某些响应下
 * 变成一个 500 冒到用户脸上。
 */
function isObjectMissing(error: unknown): boolean {
	if (error instanceof NotFound) {
		return true;
	}
	if (error instanceof S3ServiceException) {
		return error.$metadata.httpStatusCode === NOT_FOUND_STATUS;
	}
	return false;
}

/** 按 endpoint 建一个 R2 客户端；凭据从 env 读，与调用点无关。 */
export function createR2Client(endpoint: string): S3Client {
	return new S3Client({
		credentials: {
			accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
			secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
		},
		endpoint,
		/**
		 * R2 两种寻址都支持，这里固定 path-style
		 * （`<endpoint>/<bucket>/<key>`）：它同时也是 MinIO 等自建 S3 兼容实现
		 * 唯一支持的形式，`R2_ENDPOINT` 覆盖到本地实例时不必再改一处配置。
		 */
		forcePathStyle: true,
		/** R2 没有区域概念，SigV4 要求一个非空值，官方文档规定填 "auto"。 */
		region: "auto",
	});
}

/** 读对象属性；**对象不存在返回 null，不抛**（理由见 `R2Storage` 的注释）。 */
export async function headR2Object(
	client: S3Client,
	bucket: string,
	storageKey: string
): Promise<AttachmentObjectHead | null> {
	try {
		const head = await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: storageKey })
		);
		return {
			contentLength: head.ContentLength ?? 0,
			// R2 对没带 Content-Type 的 PUT 会回落到这个值，与 S3 一致。
			contentType: head.ContentType ?? "application/octet-stream",
		};
	} catch (error) {
		if (isObjectMissing(error)) {
			return null;
		}
		throw error;
	}
}

/** 现签一个 GET URL 供前端展示。 */
export function presignR2Download(
	client: S3Client,
	bucket: string,
	storageKey: string
): Promise<string> {
	return getSignedUrl(
		client,
		new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
		{ expiresIn: DOWNLOAD_URL_TTL_SECONDS }
	);
}

/** 签一个 PUT URL 供前端直传，**content-type 进签名**（理由见下）。 */
export function presignR2Upload(
	client: S3Client,
	bucket: string,
	storageKey: string,
	contentType: string
): Promise<string> {
	return getSignedUrl(
		client,
		new PutObjectCommand({
			Bucket: bucket,
			ContentType: contentType,
			Key: storageKey,
		}),
		{
			expiresIn: UPLOAD_URL_TTL_SECONDS,
			/**
			 * **必须显式列出 content-type**：`S3RequestPresigner` 默认把
			 * content-type 塞进 unsignableHeaders，光在命令里写 `ContentType`
			 * 只是给请求加了个头，不进签名——那样签出来的 URL 可以上传任意类型，
			 * 白名单形同虚设。列进 signableHeaders 后它进入
			 * `X-Amz-SignedHeaders`，R2 会校验实际请求头与签名一致。
			 *
			 * 前端契约：PUT 时必须带上**完全相同**的 `Content-Type`，
			 * 大小写与参数都不能变，否则 R2 返回 403 SignatureDoesNotMatch。
			 */
			signableHeaders: new Set(["content-type"]),
		}
	);
}

/** 删对象。删不存在的 key 在 S3 语义下是成功，这里照单全收。 */
export async function removeR2Object(
	client: S3Client,
	bucket: string,
	storageKey: string
): Promise<void> {
	await client.send(
		new DeleteObjectCommand({ Bucket: bucket, Key: storageKey })
	);
}
