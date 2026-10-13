import { afterEach, describe, expect, it, vi } from "vitest";

import { putFileToStorage } from "@/components/cases/case-storage-put";

type Listener = (event: {
	lengthComputable: boolean;
	loaded: number;
	total: number;
}) => void;

class FakeXhr {
	static last: FakeXhr | null = null;
	readonly headers = new Map<string, string>();
	method = "";
	onabort: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onload: (() => void) | null = null;
	sent: unknown = null;
	status = 0;
	readonly upload: { onprogress: Listener | null } = { onprogress: null };
	url = "";

	constructor() {
		FakeXhr.last = this;
	}

	open(method: string, url: string) {
		this.method = method;
		this.url = url;
	}

	send(body: unknown) {
		this.sent = body;
	}

	setRequestHeader(name: string, value: string) {
		this.headers.set(name, value);
	}
}

function lastRequest(): FakeXhr {
	if (FakeXhr.last === null) {
		throw new Error("没有发出请求");
	}
	return FakeXhr.last;
}

const FILE = new File(["png"], "a.png", { type: "image/png" });

afterEach(() => {
	vi.unstubAllGlobals();
	FakeXhr.last = null;
});

describe("putFileToStorage：把图片 PUT 到预签名地址，并报告上传进度", () => {
	it("用 PUT 发送文件和 Content-Type，进度按已发送的比例报告", async () => {
		vi.stubGlobal("XMLHttpRequest", FakeXhr);
		const progress: number[] = [];
		const done = putFileToStorage({
			contentType: "image/png",
			file: FILE,
			onProgress: (fraction) => progress.push(fraction),
			url: "https://r2.example/put",
		});
		const request = lastRequest();
		expect(request.method).toBe("PUT");
		expect(request.url).toBe("https://r2.example/put");
		expect(request.headers.get("Content-Type")).toBe("image/png");
		expect(request.sent).toBe(FILE);

		request.upload.onprogress?.({
			lengthComputable: true,
			loaded: 1,
			total: 4,
		});
		request.upload.onprogress?.({
			lengthComputable: false,
			loaded: 2,
			total: 0,
		});
		request.status = 200;
		request.onload?.();

		await expect(done).resolves.toBeUndefined();
		expect(progress).toEqual([0.25, 1]);
	});

	it("存储返回错误状态码时失败，原因中有状态码", async () => {
		vi.stubGlobal("XMLHttpRequest", FakeXhr);
		const done = putFileToStorage({
			contentType: "image/png",
			file: FILE,
			onProgress: vi.fn(),
			url: "https://r2.example/put",
		});
		const request = lastRequest();
		request.status = 403;
		request.onload?.();
		await expect(done).rejects.toThrow("上传到存储失败（HTTP 403）");
	});

	it("网络中断时失败，并说明原因", async () => {
		vi.stubGlobal("XMLHttpRequest", FakeXhr);
		const done = putFileToStorage({
			contentType: "image/png",
			file: FILE,
			onProgress: vi.fn(),
			url: "https://r2.example/put",
		});
		lastRequest().onerror?.();
		await expect(done).rejects.toThrow("网络中断，上传失败");
	});
});
