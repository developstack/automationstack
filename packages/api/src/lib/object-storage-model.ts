import type { AttachmentObjectStore } from "./attachment-ingest";

/** 上传地址允许的对象：类型和准确的字节数。 */
export interface UploadObject {
	contentLength: number;
	contentType: string;
}

/** 对象存储：服务器本地目录或 Cloudflare R2。调用方不需要知道是哪一种。 */
export interface ObjectStorage extends AttachmentObjectStore {
	/** 用例图片的下载地址。地址长期不变，所以浏览器可以缓存它。 */
	caseImageUrl: (storageKey: string) => Promise<string>;
	/** 有过期时间的下载地址。执行页的附件使用它。 */
	presignDownload: (storageKey: string) => Promise<string>;
	/** 签发上传地址。地址只接受这个类型和这个准确大小的文件。 */
	presignUpload: (storageKey: string, object: UploadObject) => Promise<string>;
}
