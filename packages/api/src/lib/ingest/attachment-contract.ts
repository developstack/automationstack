import { z } from "zod";

import { MAX_INGEST_SOURCE_REF_LENGTH } from "./execution-contract";

/**
 * `POST /ingest/attachments/presign` 与 `POST /ingest/attachments/register`
 * 的**线上契约**（plan §5.6）。
 *
 * 与 `./execution-contract` 同构，理由也一样：三种语言的 SDK 照这里的形状发包，
 * 契约必须能被单独读懂、也必须能被测试直接 import——api 包的 vitest project
 * 不带 `DATABASE_URL`，任何一条通向 `@automationstack/db` 的运行时 import
 * 都会让 import 这个文件的测试在模块求值期就炸。
 * 纯折算在 `./attachment-reconcile`，编排在 `./attachment-uploads`。
 *
 * ## 为什么附件也是两阶段（presign → 直传 R2 → register）
 *
 * 与手工上传完全同构，且**必须**同构：预签名 URL 一发出去就管不住实际传了什么，
 * 所以落库的 size / contentType 只能来自 `HeadObject` 读回的客观事实；
 * 而 presign 完就直接登记会造出「报告页上永远加载不出的幽灵行」
 * （`routers/test-run-attachments.ts` 的 `register` 已经点名了这个问题）。
 * 代价是 SDK 每个文件要发两次请求——但两次都是批量的，一次执行仍然只有
 * 「一次 presign + N 次 PUT + 一次 register」。
 */

/** 与 `routers/test-run-attachments.ts` 同一份 kind 词汇表。 */
const attachmentKindSchema = z.enum(["screenshot", "video", "log", "other"]);

/**
 * 一次请求最多带多少个附件。**服务端的硬闸**，不是配额。
 *
 * 与 `MAX_INGEST_RESULTS_PER_REQUEST` 取同一个数、同一个理由：这是拿 token
 * 就能打的外部端点，没有上限时一次几万条的请求会一路走进批量 SQL。
 * 真正治理体量的是下面按任务计的两个配额，这一条只负责让畸形请求在
 * 碰到数据库之前就拿到一条指着字段名的 400。
 */
export const MAX_INGEST_ATTACHMENTS_PER_REQUEST = 2000;

/**
 * **单次请求内、单个测试任务**的附件条数上限（§5.6）。
 *
 * 依据：一次执行现实里失败几十到一两百条，每条最多三件（截图 + 日志 + 录屏），
 * 上界就在 300～500。取 500 留一档余量，同时把真正要防的那种事故挡在门外——
 * 脚本 bug 导致**通过的用例也传截图**，那会是 2000 条结果各带一张。
 *
 * ⚠️ 按**单个任务**计，不是按整次执行的总和：同一条 sourceRef 可能落在多个
 * 未提交任务里（D33），按总和计会让一个人的执行横跨三个任务时配额莫名其妙
 * 缩水成三分之一——而那三份 object 是 key 规则（含 `{runId}/{runCaseId}`）
 * 强制要求的，不是他多传的。
 */
export const MAX_AUTOMATION_ATTACHMENTS_PER_RUN = 500;

/** 1 GiB。把配额写成人能读的算式，而不是 1_073_741_824 这个魔法数。 */
const BYTES_PER_GIB = 1024 * 1024 * 1024;

/**
 * **单次请求内、单个测试任务**的附件总字节上限（§5.6）。
 *
 * 依据：条数上限单独作用时，最坏情况是 500 × `MAX_ATTACHMENT_BYTES`（20 MiB）
 * = 10 GiB，一次上报就能把 bucket 撑到那个量级。1 GiB 把它压回一个数量级以内，
 * 同时对真实用量绰绰有余：200 张 1 MiB 截图 + 50 段 15 MiB 录屏还在这个数以内。
 * 换算成时间也说得通——1 GiB 在 1 MB/s 的上行要传十几分钟，
 * 超过这个量级的单次执行本来就该改成「只传失败的」而不是提高配额。
 *
 * 单文件大小仍由 `MAX_ATTACHMENT_BYTES` 管，**不另立一套**：那条尺子对
 * 手工和脚本一视同仁，在这里再写一个单文件上限只会让两处迟早分叉。
 */
export const MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN = BYTES_PER_GIB;

/**
 * 体积在 zod 这一层只保证「是个正整数」，上限交给 `validateAttachmentUpload`
 * 与配额判定：那样超限时上报方拿到的是一条带具体上限的中文说明，
 * 而不是一条 zod 的字段校验错误——与手工路径的取舍逐字相同。
 */
const sizeBytesSchema = z.int().positive();

export const ingestAttachmentPresignItemSchema = z.object({
	contentType: z.string().min(1),
	kind: attachmentKindSchema,
	sizeBytes: sizeBytesSchema,
	/**
	 * 附件挂在哪条用例上。**归属仍然由 sourceRef 自己解析**（§3.7 / D31）：
	 * 与结论走同一条路——这里同样没有、也永远不会有 `runCaseId` 参数：
	 * 让上报方指定往哪一行挂附件，就等于把 D31 那个口子在附件这条路上重开一次。
	 */
	sourceRef: z
		.string()
		.min(1)
		.max(
			MAX_INGEST_SOURCE_REF_LENGTH,
			`sourceRef 最长 ${MAX_INGEST_SOURCE_REF_LENGTH} 字符`
		),
});

export const ingestAttachmentPresignRequestSchema = z.object({
	/**
	 * ⚠️ **这里允许 sourceRef 重复**，与 `results` 正相反（那边重复即整批 400）。
	 * 一条失败自带截图 + 日志 + 录屏是常态，去重会把它们砍成一件。
	 * 结论只能有一个（重复是真正的产品歧义），附件天然是多件。
	 */
	attachments: z
		.array(ingestAttachmentPresignItemSchema)
		.max(
			MAX_INGEST_ATTACHMENTS_PER_REQUEST,
			`一次最多申请 ${MAX_INGEST_ATTACHMENTS_PER_REQUEST} 个附件的签名；请分批`
		),
	projectId: z.uuid(),
	/**
	 * 与 `ingestExecutionRequestSchema.runIds` 同义、同默认值，**必须一起传**：
	 * 结论那一轮收窄到了哪几个任务，附件就该跟着收窄到哪几个。
	 * 少传一次，附件会挂到本轮结论压根没写过的任务上。
	 */
	runIds: z.array(z.uuid()).nullable().default(null),
});

/**
 * `storageKey` 的长度上限，取 **255**——与同文件 `fileName` 那一档同一个数、
 * 同一个理由：这是「一段文件路径」该有的量级，超过它的输入不可能是我们签出去的
 * 那条 key，只可能是畸形请求。
 *
 * 有依据地说，服务端能生成的最长 key 是 **173 字符**，按
 * `buildAttachmentStorageKey` 的规则逐段算出来的：
 * `test-runs/`（10）+ uuid（36）+ `/` + uuid（36）+ `/` + uuid（36）+ `/` = 121，
 * 加上文件名段 `screenshot`（最长的 kind，10）+ `-` + uuid（36）+ `.` +
 * `webp`（最长的扩展名，4）= 52。255 盖住它还留了 82 字符余量，
 * 于是**凡是我们自己签出去的 key 都不可能先撞上这条 400**
 * （与 `MAX_INGEST_ATTACHMENT_BODY_BYTES` 那条 413 的取舍逐字相同）。
 *
 * 为什么不干脆按 173 卡死：那等于把 key 规则的实现细节冻进线上契约，
 * 以后 kind 词汇表多一个更长的词、或者换一种扩展名，先炸的是上报方的 400。
 * 真正判定「这条 key 是不是我们签的」是 `isAttachmentKeyOwnedBy`
 * （必须落在这条用例行的前缀下、且不含 `..`），本条只是让一个几 MB 长的
 * 字符串在碰到那道判定与数据库之前就拿到一条指着字段名的 400。
 */
export const MAX_INGEST_STORAGE_KEY_LENGTH = 255;

export const ingestAttachmentRegisterItemSchema = z.object({
	/** 展示用的原始文件名，**只登记时收**——object key 规则刻意不含文件名。 */
	fileName: z.string().min(1).max(255),
	kind: attachmentKindSchema,
	/**
	 * presign 那一轮返回的 `runCaseId`，原样回传。
	 *
	 * 这里出现 `runCaseId` 不与 D31 冲突：它不是「上报方选择往哪写」，
	 * 而是把服务端刚刚解析出来的结果送回来配对，且 `storageKey` 必须
	 * 落在这条用例行的前缀下才认（`isAttachmentKeyOwnedBy`）——
	 * 编不出一个能过校验的组合。
	 */
	runCaseId: z.uuid(),
	/**
	 * 同上，presign 返回的 `runId` 原样回传。
	 *
	 * 收它**只为把守卫与归属查询按任务批量做**（几百个附件逐条各开一个事务、
	 * 反复抢同一把 `test_runs` 行锁，正是 §5.3 那条「不许 N+1」拦的东西），
	 * 不是让上报方选择往哪写：与 `runCaseId` 对不上的组合会因为那条用例行
	 * 不在这个任务里而被逐条拒绝，编不出一个能过校验的组合。
	 */
	runId: z.uuid(),
	storageKey: z
		.string()
		.min(1)
		.max(
			MAX_INGEST_STORAGE_KEY_LENGTH,
			`storageKey 最长 ${MAX_INGEST_STORAGE_KEY_LENGTH} 字符；请原样回传 presign 返回的那一条，不要自己拼`
		),
});

export const ingestAttachmentRegisterRequestSchema = z.object({
	attachments: z
		.array(ingestAttachmentRegisterItemSchema)
		.max(
			MAX_INGEST_ATTACHMENTS_PER_REQUEST,
			`一次最多登记 ${MAX_INGEST_ATTACHMENTS_PER_REQUEST} 个附件；请分批`
		),
});

/**
 * 一个签好的直传位置。
 *
 * `index` 是请求里 `attachments` 数组的下标，**不能省**：同一条 sourceRef 可能
 * 落在多个任务的多个 run_case 上（D33），于是一个本地文件会拿到多个 URL；
 * 而同一条用例又完全可能带两张截图（同 sourceRef、同 kind、同 contentType）。
 * 没有下标，SDK 无法把「这个 URL 该 PUT 哪个本地文件」对应回去——
 * sourceRef + kind 根本不是一个唯一键。
 */
export const ingestAttachmentUploadSchema = z.object({
	/**
	 * 签名时锁定的 contentType，**PUT 时必须逐字带上同一个值**，
	 * 大小写与参数都不能变，否则 R2 返回 403 SignatureDoesNotMatch
	 * （签名把 content-type 列进了 `SignedHeaders`，见 `lib/r2.ts`）。
	 */
	contentType: z.string(),
	index: z.int().nonnegative(),
	runCaseId: z.uuid(),
	runId: z.uuid(),
	/** 直接进 SDK 日志：附件写进了哪个任务，与 `writtenTo` 一样要指名道姓。 */
	runName: z.string(),
	sourceRef: z.string(),
	/** 传完后原样回传给 `register`，SDK 不要拿它拼任何路径。 */
	storageKey: z.string(),
	uploadUrl: z.url(),
});

/**
 * 没签出 URL 的那些，**逐条列出，绝不静默丢弃**（沿用 `outOfScope` 的既定语义）。
 *
 * `runName` 为 null 表示这条根本没落到任何具体任务上（用例不存在、
 * 没有未提交任务收它、或者存储未配置）；非 null 时是**那个任务**拒了它
 * ——待评审、配额用完、写入前一瞬被提交。不指名道姓的话，
 * 一条在 A 任务签成功、在 B 任务被拒的 sourceRef 会让对账单读起来自相矛盾。
 */
export const ingestAttachmentRejectionSchema = z.object({
	index: z.int().nonnegative(),
	reason: z.string(),
	runName: z.string().nullable(),
	sourceRef: z.string(),
});

export const ingestAttachmentPresignReceiptSchema = z.object({
	/** 签名有效期，SDK 据此决定还要不要重试上传（`UPLOAD_URL_TTL_SECONDS`）。 */
	expiresInSeconds: z.int().positive(),
	rejected: z.array(ingestAttachmentRejectionSchema),
	/**
	 * R2 未配置时为 false，此时 `uploads` 为空、每个请求项各有一条 `rejected`。
	 *
	 * **这仍然是 200**（§5.6 / 第二期 D9 同构）：附件传不上去不能拖垮整次上报，
	 * 结论那一轮早就写进去了。做成 5xx 会让 SDK 把一次成功的上报判成失败。
	 */
	storageConfigured: z.boolean(),
	uploads: z.array(ingestAttachmentUploadSchema),
});

export const ingestAttachmentRegisteredSchema = z.object({
	attachmentId: z.uuid(),
	index: z.int().nonnegative(),
	runCaseId: z.uuid(),
	storageKey: z.string(),
});

/** 登记阶段的拒绝：这时已经没有 sourceRef 了，定位靠 `runCaseId` + `storageKey`。 */
export const ingestAttachmentRegisterRejectionSchema = z.object({
	index: z.int().nonnegative(),
	reason: z.string(),
	runCaseId: z.uuid(),
	storageKey: z.string(),
});

export const ingestAttachmentRegisterReceiptSchema = z.object({
	registered: z.array(ingestAttachmentRegisteredSchema),
	rejected: z.array(ingestAttachmentRegisterRejectionSchema),
	storageConfigured: z.boolean(),
});

/** 线上原样。SDK 照这个发包。 */
export type IngestAttachmentPresignRequestWire = z.input<
	typeof ingestAttachmentPresignRequestSchema
>;
/** 解析后（默认值已填）。服务端内部一律用这个。 */
export type IngestAttachmentPresignRequest = z.output<
	typeof ingestAttachmentPresignRequestSchema
>;
export type IngestAttachmentPresignItem = z.output<
	typeof ingestAttachmentPresignItemSchema
>;
export type IngestAttachmentPresignReceipt = z.output<
	typeof ingestAttachmentPresignReceiptSchema
>;
export type IngestAttachmentUpload = z.output<
	typeof ingestAttachmentUploadSchema
>;
export type IngestAttachmentRejection = z.output<
	typeof ingestAttachmentRejectionSchema
>;
export type IngestAttachmentRegisterRequestWire = z.input<
	typeof ingestAttachmentRegisterRequestSchema
>;
export type IngestAttachmentRegisterRequest = z.output<
	typeof ingestAttachmentRegisterRequestSchema
>;
export type IngestAttachmentRegisterItem = z.output<
	typeof ingestAttachmentRegisterItemSchema
>;
export type IngestAttachmentRegisterReceipt = z.output<
	typeof ingestAttachmentRegisterReceiptSchema
>;
export type IngestAttachmentRegistered = z.output<
	typeof ingestAttachmentRegisteredSchema
>;
export type IngestAttachmentRegisterRejection = z.output<
	typeof ingestAttachmentRegisterRejectionSchema
>;
