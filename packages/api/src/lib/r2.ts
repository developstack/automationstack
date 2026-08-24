import { env, isR2Configured } from "@automationstack/env/server";
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

import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";
import {
	DOWNLOAD_URL_TTL_SECONDS,
	UPLOAD_URL_TTL_SECONDS,
} from "./attachment-policy";

/**
 * Cloudflare R2 附件存储（plan §6）。
 *
 * 这个文件只跟外部对象存储打交道，**不 import 任何 db / drizzle 符号**。
 * 附件元数据的每一行 SQL 都在
 * `packages/db/src/repositories/test-run-attachments-repository.ts`；
 * 「允许多大、允许什么类型、key 怎么拼」在 `./attachment-policy.ts`。
 *
 * ## 为什么是「预签名直传」而不是走我们的服务器
 *
 * 录屏动辄几十 MB，经服务器中转意味着请求体要完整落到 Node 进程里，
 * 内存与带宽都随并发线性涨，而这条路径没有任何我们需要参与的业务逻辑。
 * 前端拿签名 URL 直接 PUT 到 R2，**文件字节永远不经过我们的进程**。
 *
 * ## 代价：孤儿对象
 *
 * 两阶段（presign → 前端直传 → register）必然产生**已上传但没登记**的对象：
 * 用户传到一半关页面、传完 register 请求失败、或者纯粹拿到签名后没传完。
 * 这是该方案的固有代价，本期接受，不引定时任务。
 * 兜底靠 key 前缀（见 `./attachment-policy.ts` 的 `buildAttachmentStorageKey`）：
 * 前缀里带了 projectId / runId / runCaseId，将来要清理时可以
 * `ListObjectsV2(prefix = "test-runs/<projectId>/")` 拉出对象清单，
 * 与 `test_run_attachments.storage_key` 做差集，删掉差集里**创建时间超过一天**的对象
 * （一天的宽限期是为了不误删「正在传、还没 register」的那些）。
 * 用一次性脚本或运维手动跑即可，不值得为它引入一个需要部署与监控的活动部件。
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

/**
 * 对象在 bucket 里的**客观事实**，由 `HeadObject` 读回。
 *
 * `register` 落库时以它为准，不采信前端回传的 size / contentType：
 * 预签名 URL 一发出去，实际传了多大、传的什么类型就不再受我们控制，
 * 前端那两个值只是「用户点上传时它自己说的」。
 */
export type R2ObjectHead = AttachmentObjectHead;

/**
 * 真实客户端 = 入库校验要的那两个方法（`headObject` / `remove`，见
 * `AttachmentObjectStore`）+ 签名。用 `extends` 而不是各写一遍，是为了让
 * 「校验逻辑要什么」和「客户端提供什么」不可能各自漂移。
 *
 * `headObject` **对象不存在时返回 null**，不抛：「不存在」是一条正常业务分支
 * （presign 完没传就直接 register，或者传到一半断了），做成异常会逼调用方
 * 用 try/catch 当控制流。
 */
export interface R2Storage extends AttachmentObjectStore {
	/** 现签一个 15 分钟的 GET URL 供前端展示。 */
	presignDownload: (storageKey: string) => Promise<string>;
	/** 签一个 5 分钟的 PUT URL 供前端直传。 */
	presignUpload: (storageKey: string, contentType: string) => Promise<string>;
}

/**
 * 客户端缓存：S3Client 内部持有连接池与凭证解析器，每次请求新建一个
 * 会让每次上传都重做一遍 endpoint 解析。env 在进程生命周期内不变，缓存安全。
 */
let cachedStorage: R2Storage | null = null;

function resolveEndpoint(): string | null {
	if (env.R2_ENDPOINT) {
		return env.R2_ENDPOINT;
	}
	if (env.R2_ACCOUNT_ID) {
		return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
	}
	return null;
}

function createStorage(bucket: string, endpoint: string): R2Storage {
	const client = new S3Client({
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
	return {
		headObject: async (storageKey) => {
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
		},
		presignDownload: (storageKey) =>
			getSignedUrl(
				client,
				new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
				{ expiresIn: DOWNLOAD_URL_TTL_SECONDS }
			),
		presignUpload: (storageKey, contentType) =>
			getSignedUrl(
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
			),
		remove: async (storageKey) => {
			await client.send(
				new DeleteObjectCommand({ Bucket: bucket, Key: storageKey })
			);
		},
	};
}

/**
 * 取 R2 存储句柄；**未配置时返回 null，不抛异常**。
 *
 * 与 Jira 的 `getJiraClient()` 是同一种降级姿势（plan §5.1 / D9）：
 * 调用方必须处理 null 分支，让 router 能明确回一句「附件存储未配置」，
 * 而不是让 SDK 在没有凭证的情况下抛出一个看不懂的 500。
 * R2 没配时测试任务主流程一行不受影响，只是上传入口禁用。
 */
export function getR2Storage(): R2Storage | null {
	if (!isR2Configured()) {
		return null;
	}
	const endpoint = resolveEndpoint();
	const bucket = env.R2_BUCKET;
	if (!(endpoint && bucket)) {
		return null;
	}
	if (cachedStorage === null) {
		cachedStorage = createStorage(bucket, endpoint);
	}
	return cachedStorage;
}
