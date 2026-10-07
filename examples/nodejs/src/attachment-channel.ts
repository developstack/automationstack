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

const TRAILING_SLASHES = /\/+$/;

function required(name: string, value: string | undefined): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new Error(
			`缺少 ${name}：这条用例要打真实服务端，请把它写进 examples/nodejs/.env`
		);
	}
	return trimmed;
}

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

export function presignAttachments(
	items: PresignItem[]
): Promise<PresignReceipt> {
	return postJson<PresignReceipt>(INGEST_ATTACHMENTS_PRESIGN_ROUTE, {
		attachments: items,
		projectId: ingestEnv().projectId,
		runIds: null,
	});
}

export async function putPresigned(
	upload: PresignedUpload,
	bytes: Uint8Array<ArrayBuffer>
): Promise<number> {
	const response = await fetch(upload.uploadUrl, {
		body: bytes,
		headers: { "content-type": upload.contentType },
		method: "PUT",
	});
	return response.status;
}

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

export function describePresign(receipt: PresignReceipt): string {
	if (receipt.storageConfigured && receipt.rejected.length === 0) {
		return `附件通道就绪：${receipt.uploads.length} 件全部签出了直传 URL`;
	}
	const reasons = receipt.rejected
		.map((item) => `#${item.index} ${item.sourceRef}：${item.reason}`)
		.join("；");
	return `storageConfigured=${receipt.storageConfigured}，签出 ${receipt.uploads.length} 件、被拒 ${receipt.rejected.length} 件。服务端逐条给出的理由：${reasons}`;
}
