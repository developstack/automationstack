const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

export interface StoragePut {
	contentType: string;
	file: File;
	/** 已发送的比例，0 到 1。上传成功时最后报告 1。 */
	onProgress: (fraction: number) => void;
	url: string;
}

/**
 * 把文件 PUT 到预签名地址。fetch 不报告上传进度，所以用 XMLHttpRequest。
 * 存储返回错误状态码或网络中断时，返回的 Promise 失败，错误信息可以直接显示给用户。
 */
export function putFileToStorage({
	contentType,
	file,
	onProgress,
	url,
}: StoragePut): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", url);
		request.setRequestHeader("Content-Type", contentType);
		request.upload.onprogress = (event) => {
			if (event.lengthComputable && event.total > 0) {
				onProgress(event.loaded / event.total);
			}
		};
		request.onload = () => {
			if (request.status >= HTTP_OK_MIN && request.status <= HTTP_OK_MAX) {
				onProgress(1);
				resolve();
				return;
			}
			reject(new Error(`上传到存储失败（HTTP ${request.status}）`));
		};
		request.onerror = () => reject(new Error("网络中断，上传失败"));
		request.send(file);
	});
}
