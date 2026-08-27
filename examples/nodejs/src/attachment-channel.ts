/**
 * 附件通道的三段**真实**探针：presign → 直传 PUT → register。
 *
 * 为什么示例里要有这么一段：`docs/phase3-automation-plan.md` 的「附件」验收组里，
 * 除了「R2 未配置时降级」那一条，其余四条至今都还是 `[ ]`，计划里自己写着——
 *
 * > **未验证项（2026-08-25）：附件真正上传成功那条路径，三份示例一次都没验过。**
 * > 这台开发服务端的 R2 没配，`presign` 一律返回 `storageConfigured: false`，
 * > 所以示例每次都只走到**降级分支**……预签名 PUT、`register` 回执、分块上传
 * > 在真实服务端上**都没跑过**，只有单元测试里的假 transport 覆盖。
 *
 * 三个框架各认领其中一段，把那条路径**真的走一遍**。走通了那几个勾才有资格打；
 * 走不通就红着，而失败信息是服务端自己的原话，不是我们编的。
 *
 * ⚠️ 这里用的是裸 `fetch`，**不是** SDK 的 `IngestHttpClient`：切面判据要求测试
 * 一侧不出现任何上报动作。从 SDK 拿的只有两条**路由常量**——那顺带还是一道漂移
 * 探针，常量跟此刻在跑的服务端对不上，这里当场 404。
 *
 * ⚠️ token / projectId 只从 `process.env` 取（由 `node --env-file-if-exists=.env`
 * 注入），**从不打印**：下面每一句给人看的话里只有服务端的原文和计数。
 */

import {
	type AttachmentKind,
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
} from "@automationstack/sdk";

export interface PresignItem {
	contentType: string;
	kind: AttachmentKind;
	sizeBytes: number;
	sourceRef: string;
}

/** 契约里 `ingestAttachmentUploadSchema` 的那几个字段，取本示例用得到的。 */
export interface PresignedUpload {
	contentType: string;
	index: number;
	runCaseId: string;
	runId: string;
	runName: string;
	sourceRef: string;
	storageKey: string;
	uploadUrl: string;
}

export interface PresignRejection {
	index: number;
	reason: string;
	runName: string | null;
	sourceRef: string;
}

export interface PresignReceipt {
	expiresInSeconds: number;
	rejected: PresignRejection[];
	/** R2 未配置时为 false，此时 `uploads` 为空、每项各有一条 `rejected`。 */
	storageConfigured: boolean;
	uploads: PresignedUpload[];
}

export interface RegisterReceipt {
	registered: { attachmentId: string; index: number; storageKey: string }[];
	rejected: { index: number; reason: string; storageKey: string }[];
	storageConfigured: boolean;
}

interface IngestEnv {
	baseUrl: string;
	projectId: string;
	token: string;
}

/** 削掉 baseUrl 末尾的斜杠，理由与 `resolveReporterConfig` 那边逐字相同。 */
const TRAILING_SLASHES = /\/+$/;

function required(name: string, value: string | undefined): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		// 只说变量名，不说值：这句话会原样进对账单和 CI 日志。
		throw new Error(
			`缺少 ${name}：这条用例要打真实服务端，请把它写进 examples/nodejs/.env`
		);
	}
	return trimmed;
}

/** 读取上报所需的三个环境变量。返回值里的 token 只用于拼请求头，从不打印。 */
export function ingestEnv(): IngestEnv {
	return {
		baseUrl: required("AS_BASE_URL", process.env.AS_BASE_URL).replace(
			TRAILING_SLASHES,
			""
		),
		projectId: required("AS_PROJECT", process.env.AS_PROJECT),
		token: required("AS_TOKEN", process.env.AS_TOKEN),
	};
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const env = ingestEnv();
	const response = await fetch(`${env.baseUrl}${path}`, {
		body: JSON.stringify(body),
		headers: {
			authorization: `Bearer ${env.token}`,
			"content-type": "application/json",
		},
		method: "POST",
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`POST ${path} 返回 ${response.status}：${text.slice(0, 400)}`
		);
	}
	return (await response.json()) as T;
}

/** 第一段：申请直传签名。 */
export function presignAttachments(
	items: PresignItem[]
): Promise<PresignReceipt> {
	return postJson<PresignReceipt>(INGEST_ATTACHMENTS_PRESIGN_ROUTE, {
		attachments: items,
		projectId: ingestEnv().projectId,
		// 与结论那一轮同义：结论收窄到哪几个任务，附件就跟着收窄到哪几个。
		// 示例这一轮不收窄，传 null。
		runIds: null,
	});
}

/**
 * 第二段：把字节直传到签好的 URL。
 *
 * **不带 Authorization**——签名已经在 URL 里，多带一个头会让部分 S3 兼容实现
 * 按「双重鉴权」直接 400。`contentType` 必须逐字用 presign 回来的值
 * （它进了签名的 `SignedHeaders`）。
 */
export async function putPresigned(
	upload: PresignedUpload,
	// `Uint8Array<ArrayBuffer>` 而不是光秃秃的 `Uint8Array`：这份 tsconfig 开了
	// DOM lib（wdio 的 `browser.execute` 需要），于是 `fetch` 的 body 用的是 DOM
	// 那个 `BodyInit`，它只收明确背靠 `ArrayBuffer` 的视图。`Buffer` 不满足，
	// 调用方用 `Uint8Array.from(...)` 转一下即可。
	bytes: Uint8Array<ArrayBuffer>
): Promise<number> {
	const response = await fetch(upload.uploadUrl, {
		body: bytes,
		headers: { "content-type": upload.contentType },
		method: "PUT",
	});
	return response.status;
}

/** 第三段：把传完的 object 登记成附件行。 */
export function registerAttachments(
	uploads: PresignedUpload[],
	fileNameOf: (upload: PresignedUpload) => string
): Promise<RegisterReceipt> {
	return postJson<RegisterReceipt>(INGEST_ATTACHMENTS_REGISTER_ROUTE, {
		attachments: uploads.map((upload) => ({
			fileName: fileNameOf(upload),
			kind: upload.storageKey.includes("/log-") ? "log" : "screenshot",
			runCaseId: upload.runCaseId,
			runId: upload.runId,
			storageKey: upload.storageKey,
		})),
	});
}

/**
 * 把一份 presign 对账单说成一句人话。
 *
 * 失败时这句话就是断言的差异文本，所以它**只转述服务端的原文**
 * （`reason` 逐字），一个字都不替它改写。
 */
export function describePresign(receipt: PresignReceipt): string {
	if (receipt.storageConfigured && receipt.rejected.length === 0) {
		return `附件通道就绪：${receipt.uploads.length} 件全部签出了直传 URL`;
	}
	const reasons = receipt.rejected
		.map((item) => `#${item.index} ${item.sourceRef}：${item.reason}`)
		.join("；");
	return `storageConfigured=${receipt.storageConfigured}，签出 ${receipt.uploads.length} 件、被拒 ${receipt.rejected.length} 件。服务端逐条给出的理由：${reasons}`;
}
