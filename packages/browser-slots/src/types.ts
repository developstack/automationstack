import type { FarmSessionProtocol } from "@automationstack/db/schema/farm-enums";

/**
 * 「一个会话要占用的浏览器槽位」从哪来（plan §5.6 / §12）。
 *
 * 这层抽象存在的**唯一**理由是 Phase E 的第二实现（实机节点）：会话状态机、
 * 双协议代理、recorder、finalize、配额全都只依赖下面这几个字段，
 * 不依赖 Docker。换句话说，判断某段逻辑该不该写进 provider 的标准是
 * 「换成一台真机之后它还成不成立」——成立的留在外面，不成立的进来。
 *
 * 容器与实机的根本差别（销毁 vs 复位）也收在这里：`release()` 对 Docker 是
 * `rm -f`，对实机是「杀进程树 + 删 profile + 健康探测」，调用方不需要知道。
 */

/** 容器 entrypoint 的 `MODE`。与 `farm_session_protocol` 同构，但它是**容器侧**的词。 */
export type FarmSlotMode = FarmSessionProtocol;

/**
 * 容器 label 的三个键（plan §5.6）。
 *
 * **reaper 判杀只凭 label**：farm 内存丢了、DB 挂了，过期容器照收。所以这三个
 * 常量是回收链路的真相来源，不能只写在 docker.ts 的字面量里——reaper 要按它们
 * 过滤，测试要按它们断言，任何一处写错都表现为「孤儿容器永远杀不掉」。
 */
export const FARM_LABEL_MANAGED = "as.farm.managed";
export const FARM_LABEL_SESSION = "as.farm.session";
export const FARM_LABEL_EXPIRES_AT = "as.farm.expires_at";

export interface AcquireSlotInput {
	/**
	 * 调度选中的浏览器名（`chrome` / `chromium` / `edge`…）。
	 *
	 * **可选**，因为它只对 local 系的槽位有意义：Docker 那边的浏览器是镜像决定的，
	 * `image` 已经把话说完了。不给（内建源的老调用路径）时，LocalProvider 回落到
	 * 配置的 chrome bin——与它一直以来的行为逐字相同。
	 *
	 * 为什么它必须由上游下发而不是让 provider 自己猜：见协议层 `rpc.ts` 里
	 * `acquireParams` 那段——筛选与兑现分成两份规则，分叉的那天没有一侧会报错。
	 */
	browserName?: string | undefined;
	/** 调度选中的版本。null/缺省 = 哪个版本都行（与协议里的可空语义一致）。 */
	browserVersion?: string | null | undefined;
	/** 到期时刻（epoch 秒），写进 `as.farm.expires_at` label 供 reaper 判过期。 */
	expiresAtEpochSec: number;
	/** 目录行里的镜像 tag，如 `automationstack-browser-chromium:140`。 */
	image: string;
	mode: FarmSlotMode;
	/**
	 * 会话点名要哪个**槽位来源**（客户端的 `as:options.node`）。
	 *
	 * 这是**复合源的路由字段**，本包的两个实现（Docker / Local）一律忽略它：
	 * 它们各自就是一个源，没有「选一个」这回事。真正读它的是 farm 那边的
	 * 复合 provider（`apps/farm/src/nodes/`），它按这个名字在「内建伪节点 +
	 * 在线实机节点」里钉选一个，选不中就给客户端一句明确的错误。
	 *
	 * 之所以放进这个入参而不是让 farm 自己在外面分派：分派的结果必须和
	 * `acquire` 是同一次调用，否则「选中 A → A 掉线 → 落到 B」这条竞态里
	 * 就会出现「库里记 A、容器在 B」的会话，而那种会话事后无法排查。
	 */
	nodeHint?: string;
	/** 平台 sessionId，写进 `as.farm.session` label 供对账。 */
	sessionId: string;
}

export interface AcquiredSlot {
	/**
	 * 这个槽位额外要求浏览器带上的启动参数，由 WebDriver 侧经 caps 注入
	 * （`apps/farm/src/wd/capabilities.ts` 的 `injectSlotArgs`）。CDP 模式用不上：那条路径的
	 * 浏览器是 provider 自己拉起来的，参数早就直接写在命令行上了。
	 *
	 * Docker 恒为空数组——容器里那份 profile 与无头设置由镜像的 entrypoint 决定，
	 * 容器用后即毁，farm 不需要过问。本地进程槽位则必须靠它把
	 * `--user-data-dir=<槽位目录>/profile` 传下去：不指定的话 chromedriver 会自己
	 * 建一个随机临时 profile，而**孤儿清扫是按槽位目录认领进程的**（见 local.ts），
	 * 认不出来的 Chrome 就永远留在机器上了。
	 */
	browserArgs: readonly string[];
	/**
	 * browser-level CDP 的端口。**不是常量**：容器里写死 9222 没问题是因为每个
	 * 容器一个网络命名空间，而本地进程槽位全在同一台机器的同一个 IP 上，
	 * 两条并发会话写死同一个端口就是第二条起不来。
	 *
	 * WebDriver 侧要拿它注入 `--remote-debugging-port`（D5），所以注入必须发生在
	 * acquire **之后**——`apps/farm/src/wd/create-session.ts` 的顺序正是如此（先 launchSession
	 * 拿到槽位，再 injectSlotArgs 拼转发 body）。
	 */
	cdpDebugPort: number;
	/**
	 * browser-level CDP 的 HTTP 端点（如 `http://127.0.0.1:32768`）。
	 * **两种模式都有**：CDP 会话拿它接客户端，WebDriver 会话拿它给 recorder 挂载
	 * （create-session 时注入 `--remote-debugging-port` 就是为了这个，D5）。
	 */
	cdpHttpEndpoint: string;
	containerId: string;
	/** 容器 stdout/stderr。收尾时一次性拉取，存为 `container_log` 产物。 */
	readLogs: () => Promise<string>;
	/** 销毁槽位。**必须幂等**：reaper 与正常收尾可能并发调它。 */
	release: () => Promise<void>;
	/** chromedriver 的 HTTP 端点；`cdp` 模式下容器里根本没有 chromedriver，故为 null。 */
	wdEndpoint: string | null;
}

/**
 * 一个被 farm 管着的槽位在**外部世界**里的样子。
 *
 * 字段全部来自 label 而不是内存或 DB，所以两个可空是真的可空：手工 `docker run`
 * 一个带 managed label 的容器、或者旧版本 farm 留下的容器，都可能缺 session /
 * expires_at。reaper 对这两种缺失的处理必须是「照杀」而不是「跳过」，
 * 否则一个 label 写坏的容器就能永久赖在机器上。
 *
 * 本地进程槽位没有 label 这种东西，它的等价真相源是**槽位目录**
 * （`<FARM_WORK_DIR>/local-slots/<sessionId>/meta.json`，见 `local-slots.ts`）：
 * 目录名当 sessionId、meta 里那两个字段当另外两个 label，读不出来时同样置 null。
 */
export interface ManagedContainer {
	containerId: string;
	expiresAtEpochSec: number | null;
	sessionId: string | null;
}

export interface SlotProvider {
	/**
	 * 拉起一个槽位并等它**存在**（不等它 ready——探活是数据面的事，因为
	 * 「ready 长什么样」按协议不同：WebDriver 探 `/status`，CDP 探 `/json/version`）。
	 */
	acquire: (input: AcquireSlotInput) => Promise<AcquiredSlot>;
	/** 当前 daemon 上所有带 `as.farm.managed=true` 的容器，含已退出的。 */
	listManagedContainers: () => Promise<ManagedContainer[]>;
	/**
	 * 按 id 销毁一个**没有 `AcquiredSlot` 句柄**的槽位。幂等。
	 *
	 * reaper 需要它：它扫出来的孤儿容器根本不在内存注册表里（farm 重启前留下的、
	 * 或者 label 写坏的），手上只有一个 id。`AcquiredSlot.release()` 覆盖不到
	 * 这条路径——那是「我拉起的，我来放」，而回收面对的恰恰是「没人认领的」。
	 */
	releaseContainer: (containerId: string) => Promise<void>;
}
