import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { getR2Storage } from "@automationstack/api/lib/r2";
import type { Hono } from "hono";

import { farmConfig } from "./config";

/**
 * 会话产物的落地（plan §5.2 / D12）。
 *
 * 两种模式，由「R2 有没有配」自动二选一，**调用方不感知**：
 * - `r2`：走 `packages/api/src/lib/r2.ts` 那个句柄，与手工附件、SDK 附件同一个
 *   bucket、同一套凭据、同一份「配没配」的判据；
 * - `local`：拷进 `FARM_WORK_DIR/artifacts/<sessionId>/`，并开一条无鉴权的
 *   GET 路由供 web 取用。
 *
 * `meta.storage` 记下走的是哪一种（schema 那一列点名了它是详情页判断「这份能不能
 * 下载」的唯一依据）。
 *
 * ## 为什么服务端上传要绕一次预签名 URL
 *
 * `R2Storage` 只暴露 head / presign / remove，没有 `putObject`——它是为**前端直传**
 * 设计的（文件字节不经我们的进程，理由在 r2.ts 的文件头）。farm 这边是服务端
 * 自己有一个本地文件要传，本可以直接发 `PutObjectCommand`，但那需要
 * `@aws-sdk/client-s3`，而它是 `packages/api` 的依赖、不是 `apps/farm` 的。
 * 为一次 PUT 给 farm 加一个 AWS SDK，换来的是第二处「R2 客户端怎么建」的代码——
 * 而那正是 `r2.ts` / `r2-operations.ts` 分层要避免的东西。
 *
 * 于是这里自己签一个 5 分钟的 PUT URL 再用 `fetch` 打过去：多一次签名往返
 * （本地计算，不发请求），零新依赖，且「凭据从哪来、endpoint 怎么算」仍然只有
 * 一份实现。签名把 content-type 也签进去了，所以 PUT 时必须带上**完全相同**的
 * `Content-Type`（`presignR2Upload` 的注释写了为什么）。
 *
 * 上传完再 `headObject` 读回真实 size/contentType，与
 * `attachment-register` 同一条纪律：bucket 里躺着的东西才是客观事实。
 */

export type ArtifactStorageMode = "local" | "r2";

export interface StoredArtifact {
	contentType: string;
	sizeBytes: number;
	/** 形如 `farm/<sessionId>/<filename>`，两种模式共用同一套 key 形状。 */
	storageKey: string;
}

export interface PutArtifactInput {
	contentType: string;
	/** 绝对路径，位于会话 workDir 之下。 */
	filePath: string;
	sessionId: string;
}

export interface ArtifactStorage {
	readonly mode: ArtifactStorageMode;
	put: (input: PutArtifactInput) => Promise<StoredArtifact>;
}

/**
 * key 前缀固定 `farm/`：将来要清理孤儿对象时可以
 * `ListObjectsV2(prefix="farm/")` 与 `farm_session_artifacts.storage_key` 做差集，
 * 与 `test-runs/` 前缀是同一套兜底思路（r2.ts 文件头）。
 */
function buildStorageKey(sessionId: string, fileName: string): string {
	return `farm/${sessionId}/${fileName}`;
}

/** 本地模式的落地目录。与会话 workDir 分开：workDir 收尾后要整个删掉。 */
function localArtifactDir(sessionId: string): string {
	return join(farmConfig.workDir, "artifacts", sessionId);
}

async function putToLocal(input: PutArtifactInput): Promise<StoredArtifact> {
	const fileName = basename(input.filePath);
	const dir = localArtifactDir(input.sessionId);
	await mkdir(dir, { recursive: true });
	const target = join(dir, fileName);
	await copyFile(input.filePath, target);
	const stats = await stat(target);
	return {
		contentType: input.contentType,
		sizeBytes: stats.size,
		storageKey: buildStorageKey(input.sessionId, fileName),
	};
}

function createR2ArtifactStorage(
	r2: NonNullable<ReturnType<typeof getR2Storage>>
): ArtifactStorage {
	return {
		mode: "r2",
		put: async (input) => {
			const fileName = basename(input.filePath);
			const storageKey = buildStorageKey(input.sessionId, fileName);
			const body = await readFile(input.filePath);
			const url = await r2.presignUpload(storageKey, input.contentType);
			const response = await fetch(url, {
				body: new Uint8Array(body),
				// 大小写与参数都不能变，否则 R2 回 403 SignatureDoesNotMatch。
				headers: { "content-type": input.contentType },
				method: "PUT",
			});
			if (!response.ok) {
				throw new Error(
					`上传产物到 R2 失败 key=${storageKey} status=${response.status}`
				);
			}
			const head = await r2.headObject(storageKey);
			return {
				contentType: head?.contentType ?? input.contentType,
				sizeBytes: head?.contentLength ?? body.byteLength,
				storageKey,
			};
		},
	};
}

/**
 * 按「R2 配没配」选一种。**未配置不是错误**，是降级（与 r2.ts 的 null 分支同一
 * 姿势）：本地开发不该为了看一眼录制结果先去申请一套 Cloudflare 凭据。
 */
export function createArtifactStorage(): ArtifactStorage {
	const r2 = getR2Storage();
	if (r2 === null) {
		return { mode: "local", put: putToLocal };
	}
	return createR2ArtifactStorage(r2);
}

/**
 * 这张表是**本地读取口**的 content-type 真相源，与写入侧
 * （`finalize-artifacts.ts` 存进 `farm_session_artifacts.content_type` 的那个值）
 * 各算各的。两边漏掉同一个扩展名不会有任何东西报错：库里记着 `image/jpeg`，
 * 而这条路由把同一个文件回成 `application/octet-stream`，于是详情页里那张截图
 * 变成一个下载而不是一张图。截图落盘用的是 `.jpeg`（`recorder/screenshot.ts`），
 * 所以 `.jpg` / `.jpeg` 两个都要在这儿。
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
	".har": "application/json",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".json": "application/json",
	".log": "text/plain; charset=utf-8",
	".ndjson": "application/x-ndjson",
	".png": "image/png",
	".txt": "text/plain; charset=utf-8",
};

function contentTypeOf(fileName: string): string {
	return (
		CONTENT_TYPE_BY_EXTENSION[extname(fileName).toLowerCase()] ??
		"application/octet-stream"
	);
}

/** 路径参数里只允许最普通的文件名：一个 `..` 就能读到 FARM_WORK_DIR 之外。 */
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeSegment(value: string): boolean {
	return SAFE_PATH_SEGMENT.test(value) && !value.includes("..");
}

const NOT_FOUND = 404;
const BAD_REQUEST = 400;

/**
 * 本地存储模式下的产物读取口：`GET /artifacts/:sessionId/:filename`。
 *
 * ⚠️ **无鉴权，且允许任意 Origin 的 CORS GET。** 这是一个明确的取舍，不是疏漏：
 *
 * - 它**只在本地存储模式下注册**（`createArtifactStorage()` 回 local 才挂），
 *   也就是只在「没配 R2 的开发机」上存在。生产配了 R2，产物走短期签名 URL，
 *   这条路由根本不会被挂上去。
 * - 开着 CORS 是因为 web 跑 :3001、farm 跑 :3002，详情页要跨端口把 HAR 与截图
 *   取回来渲染。开发模式下这条链路上没有 cookie、没有凭据，`*` 是够用的。
 * - 代价是同一台开发机上任何进程都能按 sessionId 猜到产物。开发机上的产物是
 *   本地跑出来的测试录像，这个代价可接受；把它带进生产则不可接受——所以
 *   **不要**把这条路由改成无条件注册。
 *
 * 路径穿越由 `isSafeSegment` 挡住：两段路径参数都必须是最普通的文件名形状。
 */
export function registerLocalArtifactRoutes(app: Hono): void {
	app.get("/artifacts/:sessionId/:filename", async (c) => {
		const sessionId = c.req.param("sessionId");
		const fileName = c.req.param("filename");
		if (!(isSafeSegment(sessionId) && isSafeSegment(fileName))) {
			return c.text("非法的产物路径", BAD_REQUEST);
		}
		try {
			const body = await readFile(join(localArtifactDir(sessionId), fileName));
			return c.body(new Uint8Array(body), 200, {
				"access-control-allow-origin": "*",
				"content-type": contentTypeOf(fileName),
			});
		} catch {
			return c.text("产物不存在", NOT_FOUND);
		}
	});
}
