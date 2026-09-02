/**
 * 会话产物的下载地址（phase4 §7）。
 *
 * 产物落在**两个不同的地方**，取决于跑的时候平台有没有配 R2：
 * - `"r2"`：farm 走 api 那套上传通道推进 bucket，`storageKey` 是 object key。
 *   访问用**现签的短期 GET URL**——库里存的绝不是完整 URL（存了几分钟后就是死链，
 *   比没有更糟，与 `case_attachments` / `test_run_attachments` 同一条规矩）。
 * - `"local"`：本地开发没配 R2，产物只落 farm 进程的工作目录（`FARM_WORK_DIR`），
 *   由 farm 自己用静态路由供出来。控制面拼得出这个地址，但它是否真的还在
 *   （farm 重启、临时目录被清）控制面无从得知——所以这条 URL 是「尽力而为」的。
 *
 * 判据只有 `meta.storage` 这一列（见 `schema/farm-session-artifacts.ts` 的注释：
 * 它是详情页判断「这份能不能下载」的唯一依据）。**认不出来就返回 null**，不猜：
 * 猜错的代价是详情页给出一个 404 的下载按钮，而用户会以为是产物丢了。
 *
 * ## 为什么整块逻辑在这里，而不是在 handler 里
 *
 * 它是这条路由上唯一会算错的东西（拼错前缀、忘了剥目录、把未配 R2 当成 local），
 * 而 handler 那一层 import 了 db repository，在 api 的 vitest project 里跑不起来
 * （没有 `DATABASE_URL`）。所以这里刻意零 import：env 与 R2 句柄都由调用方注入，
 * 于是它可测，而 handler 退化成「取两个依赖 + 逐行 map」。
 */

/**
 * 产物字节实际存在哪。与 `meta.storage` 的约定取值一一对应。
 *
 * 刻意不导出成 zod schema：`meta` 是 jsonb，形状按 `kind` 分，farm 那边写什么
 * 控制面这边并不完全知道。这里只从里面认一个字段，多余的原样放过。
 */
export type FarmArtifactStorage = "local" | "r2";

/** 尾斜杠：`FARM_PUBLIC_URL` 配成 `http://host:3002/` 时不能拼出双斜杠。 */
const TRAILING_SLASHES = /\/+$/;

/** 算下载地址真正需要的两列，独立声明以便测试不必造一整行 `FarmSessionArtifact`。 */
export interface FarmArtifactDownloadRef {
	meta: unknown;
	storageKey: string;
}

export interface FarmArtifactDownloadContext {
	/**
	 * farm 在**用户视角**的地址（`FARM_PUBLIC_URL`），不带尾斜杠也行——这里会规整。
	 * 只有 `"local"` 的产物用得上它。
	 */
	farmPublicUrl: string;
	/**
	 * 现签 R2 GET URL 的函数，直接注入 `getR2Storage()?.presignDownload`。
	 * **null = 平台没配 R2**：那种情况下 `"r2"` 产物根本签不出地址，只能回 null。
	 */
	presignR2Download: ((storageKey: string) => Promise<string>) | null;
	sessionId: string;
}

/**
 * 从 jsonb 的 `meta` 里认出存储位置。认不出（null / 不是对象 / 没有 storage /
 * 取值不在约定内）一律返回 null，由调用方决定怎么降级。
 */
export function readFarmArtifactStorage(
	meta: unknown
): FarmArtifactStorage | null {
	if (typeof meta !== "object" || meta === null || !("storage" in meta)) {
		return null;
	}
	const storage: unknown = meta.storage;
	if (storage === "r2" || storage === "local") {
		return storage;
	}
	return null;
}

/**
 * 本地产物的静态地址：`<FARM_PUBLIC_URL>/artifacts/<sessionId>/<文件名>`。
 *
 * 只取 `storageKey` 的**最后一段**：本地形态下它可能是一条绝对路径
 * （`FARM_WORK_DIR/<sessionId>/har.json`），把工作目录原样拼进 URL 既暴露了
 * 服务器的目录结构，也对不上 farm 那条按 sessionId 挂载的静态路由。
 *
 * 文件名过一遍 `encodeURIComponent`：约定的产物名（`har.json`、`shot-3.png`）
 * 编码前后一模一样，这层只为了让将来出现的怪名字不至于拼出一条非法 URL。
 */
export function buildLocalFarmArtifactUrl(
	farmPublicUrl: string,
	sessionId: string,
	storageKey: string
): string {
	const base = farmPublicUrl.replace(TRAILING_SLASHES, "");
	const fileName = storageKey.split("/").at(-1) ?? storageKey;
	return `${base}/artifacts/${sessionId}/${encodeURIComponent(fileName)}`;
}

/**
 * 一条产物的下载地址；**拿不到就是 null，不抛**。
 *
 * null 有三种成因，详情页对它们的处理是同一种（把下载按钮置灰），所以不区分：
 * 产物是 R2 的但平台没配 R2、`meta.storage` 缺失或写了没见过的值、
 * 以及将来新增的存储形态还没在这里接上。
 */
export function resolveFarmArtifactDownloadUrl(
	artifact: FarmArtifactDownloadRef,
	context: FarmArtifactDownloadContext
): Promise<string | null> {
	const storage = readFarmArtifactStorage(artifact.meta);
	if (storage === "local") {
		return Promise.resolve(
			buildLocalFarmArtifactUrl(
				context.farmPublicUrl,
				context.sessionId,
				artifact.storageKey
			)
		);
	}
	if (storage === "r2" && context.presignR2Download !== null) {
		return context.presignR2Download(artifact.storageKey);
	}
	return Promise.resolve(null);
}
