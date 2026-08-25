import { env, isR2Configured } from "@automationstack/env/server";

import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";
import {
	createR2Client,
	headR2Object,
	presignR2Download,
	presignR2Upload,
	removeR2Object,
} from "./r2-operations";

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

/**
 * 组装一个存储句柄：四个方法各自绑定同一个客户端与 bucket。
 *
 * 这里只做绑定，不含任何 R2 调用细节——那些在 `./r2-operations.ts`。
 * 于是「这个句柄提供哪些能力」一屏看得完，而 `R2Storage` 接口一改，
 * 缺哪个方法这里立刻编译不过。
 */
function createStorage(bucket: string, endpoint: string): R2Storage {
	const client = createR2Client(endpoint);
	return {
		headObject: (storageKey) => headR2Object(client, bucket, storageKey),
		presignDownload: (storageKey) =>
			presignR2Download(client, bucket, storageKey),
		presignUpload: (storageKey, contentType) =>
			presignR2Upload(client, bucket, storageKey, contentType),
		remove: (storageKey) => removeR2Object(client, bucket, storageKey),
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
