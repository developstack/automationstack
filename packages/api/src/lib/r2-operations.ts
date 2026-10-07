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

const NOT_FOUND_STATUS = 404;

function isObjectMissing(error: unknown): boolean {
	if (error instanceof NotFound) {
		return true;
	}
	if (error instanceof S3ServiceException) {
		return error.$metadata.httpStatusCode === NOT_FOUND_STATUS;
	}
	return false;
}

export function createR2Client(endpoint: string): S3Client {
	return new S3Client({
		credentials: {
			accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
			secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
		},
		endpoint,
		forcePathStyle: true,
		region: "auto",
	});
}

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
			contentType: head.ContentType ?? "application/octet-stream",
		};
	} catch (error) {
		if (isObjectMissing(error)) {
			return null;
		}
		throw error;
	}
}

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
			signableHeaders: new Set(["content-type"]),
		}
	);
}

export async function removeR2Object(
	client: S3Client,
	bucket: string,
	storageKey: string
): Promise<void> {
	await client.send(
		new DeleteObjectCommand({ Bucket: bucket, Key: storageKey })
	);
}
