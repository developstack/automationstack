/**
 * `auth.login` 的闸门：在昂贵的 PBKDF2 **之前**把不正常的登录请求挡回去。
 *
 * 两个洞同源——每次 login 无条件跑一次 600k 次迭代的 PBKDF2
 * （`packages/db/src/password.ts`，实测约 75ms，走 WebCrypto 即 libuv 线程池）：
 * 一是**字典攻击**（账号由管理员创建、用户名可枚举，猜口令的唯一成本就是那
 * 75ms）；二是**未认证 DoS**（Node 默认 `UV_THREADPOOL_SIZE=4`，几十路并发就
 * 能占满线程池，拖住所有走线程池的路径——而为了不泄露用户名是否存在，
 * `auth.login` 对不存在的用户名也照跑一次完整 KDF，那道诱饵散列必须留着，
 * 但它把这条攻击面从「存在的用户名」放大到了「任意字符串」）。
 *
 * 所以下面三道闸**全部在 KDF 之前**；第三道（并发位）是唯一与来源地址无关的
 * 一道：地址可以换，线程池的容量不能。
 *
 * ⚠️ **这是单实例的内存计数，横向扩容会让它失效。** 计数只活在本进程里：
 * 起 N 个实例，攻击者的尝试被负载均衡摊开、每个进程各算各的，等效阈值直接
 * 变成 N 倍；进程重启则清零。当前部署形态是**单个 server 容器**，够用。真要
 * 多实例，得把 IP 窗口与失败计数搬到 Redis 之类的共享存储上（并发位仍按进程
 * 算，它护的本来就是本进程的线程池）——别以为改一下 replicas 这套还成立。
 */

const ONE_SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const ONE_MINUTE_MS = SECONDS_PER_MINUTE * ONE_SECOND_MS;

/**
 * 每个来源 IP 的滑动窗口：1 分钟内最多 10 次**真正跑到 KDF** 的登录尝试。
 *
 * 取 10 是两头夹出来的：往下，一分钟内手输错十次口令的人该去点找回密码了，
 * 共用出口 IP 的办公网也很难同一分钟里还有第二个人在连错；往上，10 × 75ms
 * = 每 IP 每分钟至多 0.75 秒线程池占用，要填满四条线程一分钟（240 秒预算）
 * 得有三百多个不同源地址——那一档由下面的并发位兜底。
 */
const IP_WINDOW_MS = ONE_MINUTE_MS;
const IP_MAX_ATTEMPTS_PER_WINDOW = 10;

/**
 * 连续失败退避：同一个 (IP, 用户名) 连错 5 次开始锁，首次 30 秒，之后每失败
 * 一次翻倍，上限 15 分钟。阈值取 5 而不是 3——连错三次是日常。
 *
 * 上限取 15 分钟而不是永久锁：这套计数分辨不出敲门的是不是账号主人，永久锁
 * 等于让任何人拿一个已知用户名就能把真人关在门外。爆破成本靠指数曲线已经
 * 买到了（连错 20 次累计要等一小时以上），不必再拿可用性去加价。
 */
const BACKOFF_AFTER_FAILURES = 5;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_BASE_MS = BACKOFF_BASE_SECONDS * ONE_SECOND_MS;
const BACKOFF_MAX_MINUTES = 15;
const BACKOFF_MAX_MS = BACKOFF_MAX_MINUTES * ONE_MINUTE_MS;
const BACKOFF_GROWTH = 2;

/**
 * 同时最多几路 PBKDF2 在跑。取 2，即 `UV_THREADPOOL_SIZE` 默认值的一半。
 *
 * 这一档是 DoS 那条路的**硬保证**：不管攻击者手上有多少源地址，登录占用的
 * 线程都不会超过 2，另两条留给其它走线程池的活儿。代价是登录吞吐被按在
 * 2 / 75ms ≈ 26 次每秒——内部测试平台的真实峰值离它两三个数量级，而且超出
 * 时给的是一条明确的 429，不是把请求排进一个越排越长的队列里等超时。
 */
const MAX_CONCURRENT_VERIFICATIONS = 2;

/** 清扫间隔，以及一条 (IP, 用户名) 记录在最后一次露面后还留多久。 */
const SWEEP_INTERVAL_MS = ONE_MINUTE_MS;
const PAIR_RECORD_TTL_MS = BACKOFF_MAX_MS;

/**
 * 两张表各自的条目上限——这道闸自己也得防被打爆：不设上限，「每次换个用户名」
 * 就成了往进程里塞 Map 条目的写入原语。
 *
 * 装满后的选择是**新键放行、已有计数保住**：直接拒绝会把内存压力变成全站
 * 登录不可用；而为腾地方去淘汰老条目，淘汰掉的恰恰是攻击者那条已经退避到
 * 15 分钟的记录，等于送他一个免费的重置开关。
 */
const MAX_TRACKED_IPS = 10_000;
const MAX_TRACKED_PAIRS = 20_000;

/** 取不到来源地址时，(IP, 用户名) 这一维退化成的占位地址。 */
const UNKNOWN_IP = "unknown";

/**
 * 429 对外只有这一句话。
 *
 * 不区分「你这个 IP 太快了」和「这个账号连错太多次了」：后者一旦可分辨，
 * 就成了「这个用户名存在吗」的旁路——虽然本实现对不存在的用户名同样计数
 * （所以本来就不泄露），但把两句话合成一句能保证以后谁改了计数口径也漏不出去。
 */
export const TOO_MANY_LOGIN_ATTEMPTS_MESSAGE = "登录尝试过于频繁，请稍后再试";

export interface LoginAttemptKey {
	/** socket 层的对端地址；取不到时传 null（见 `request-client-ip.ts`）。 */
	clientIp: string | null;
	username: string;
}

export type LoginGateDecision =
	| { kind: "allowed" }
	| { kind: "rejected"; retryAfterSeconds: number };

export type VerificationSlotResult<T> =
	| { kind: "ran"; value: T }
	| { kind: "saturated" };

interface IpWindow {
	/** 窗口内的尝试时刻，升序。 */
	attempts: number[];
}

interface PairRecord {
	/** 退避解除时刻（epoch ms）；早于当前时刻即未退避。 */
	blockedUntil: number;
	consecutiveFailures: number;
	lastSeenAt: number;
}

const ipWindows = new Map<string, IpWindow>();
const pairRecords = new Map<string, PairRecord>();
let lastSweptAt = 0;
let inFlightVerifications = 0;

/**
 * 用户名统一转小写再做键。`getUserByUsername` 用的是大小写敏感的 `eq`，
 * 所以 `Admin` 与 `admin` 在库里是两个账号；这里刻意合成一个桶——否则
 * 变换大小写就是一个免费的退避重置开关。代价只有「同时存在仅大小写不同的
 * 两个账号时它们共享退避」，那本就不该发生。
 */
/**
 * 分隔符用 NUL：IP 与用户名都不可能含它，换成 `:` 之类可见字符的话，
 * ("1.2.3", "4:bob") 与 ("1.2.3:4", "bob") 会撞进同一个桶。
 * 必须写成转义序列而不是字面的裸字节——源码里直接放一个 NUL 会让 git
 * 把整个文件判成二进制，从此这个文件在 diff 和 review 里只显示
 * 「Binary file changed」，blame 也一并失效。
 */
const PAIR_KEY_SEPARATOR = "\u0000";

function pairKeyOf(key: LoginAttemptKey): string {
	return `${key.clientIp ?? UNKNOWN_IP}${PAIR_KEY_SEPARATOR}${key.username.toLowerCase()}`;
}

function backoffDelayMs(consecutiveFailures: number): number {
	const overshoot = consecutiveFailures - BACKOFF_AFTER_FAILURES;
	if (overshoot < 0) {
		return 0;
	}
	return Math.min(
		BACKOFF_BASE_MS * BACKOFF_GROWTH ** overshoot,
		BACKOFF_MAX_MS
	);
}

/**
 * 惰性清扫：没有定时器，靠登录请求本身触发，没人登录时也就不空转。两张表的
 * 过期判定不同——IP 窗口看最后一次尝试，(IP, 用户名) 记录还要求退避已经解除，
 * 否则清扫会把正在生效的锁一并抹掉。
 */
function sweepIfDue(now: number): void {
	if (now - lastSweptAt < SWEEP_INTERVAL_MS) {
		return;
	}
	lastSweptAt = now;
	const ipCutoff = now - IP_WINDOW_MS;
	for (const [key, window] of ipWindows) {
		if ((window.attempts.at(-1) ?? 0) <= ipCutoff) {
			ipWindows.delete(key);
		}
	}
	const pairCutoff = now - PAIR_RECORD_TTL_MS;
	for (const [key, record] of pairRecords) {
		if (record.lastSeenAt <= pairCutoff && record.blockedUntil <= now) {
			pairRecords.delete(key);
		}
	}
}

/**
 * 记一次尝试并返回还需等待的毫秒数（0 = 放行）。
 *
 * 只有被放行的尝试才计入窗口：被拒的请求根本没跑 KDF，把它也算进去等于让一个
 * 还在傻敲的客户端把自己的窗口永远填满，而窗口本来要能自己排空。地址取不到时
 * 这一维整个跳过——DoS 那条路由并发位独立兜着，这里丢的只是按地址分摊的精细度。
 */
function consumeIpBudget(clientIp: string | null, now: number): number {
	if (clientIp === null) {
		return 0;
	}
	const window = ipWindows.get(clientIp);
	if (window === undefined) {
		if (ipWindows.size < MAX_TRACKED_IPS) {
			ipWindows.set(clientIp, { attempts: [now] });
		}
		return 0;
	}
	const kept = window.attempts.filter((at) => at > now - IP_WINDOW_MS);
	window.attempts = kept;
	if (kept.length >= IP_MAX_ATTEMPTS_PER_WINDOW) {
		return (kept[0] ?? now) + IP_WINDOW_MS - now;
	}
	kept.push(now);
	return 0;
}

function pairBackoffRemainingMs(key: string, now: number): number {
	const record = pairRecords.get(key);
	if (record === undefined) {
		return 0;
	}
	record.lastSeenAt = now;
	return record.blockedUntil > now ? record.blockedUntil - now : 0;
}

function rejected(remainingMs: number): LoginGateDecision {
	return {
		kind: "rejected",
		retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / ONE_SECOND_MS)),
	};
}

/**
 * 登录请求的准入判定。**必须在读库与 KDF 之前调用**——它挡的正是那两样开销。
 *
 * 先判退避、后判 IP 窗口：退避是「这个账号刚连错过」，拒它不该消耗 IP 预算。
 */
export function checkLoginGate(key: LoginAttemptKey): LoginGateDecision {
	const now = Date.now();
	sweepIfDue(now);
	const backoffRemainingMs = pairBackoffRemainingMs(pairKeyOf(key), now);
	if (backoffRemainingMs > 0) {
		return rejected(backoffRemainingMs);
	}
	const ipWaitMs = consumeIpBudget(key.clientIp, now);
	if (ipWaitMs > 0) {
		return rejected(ipWaitMs);
	}
	return { kind: "allowed" };
}

/**
 * 跑一次口令校验，占用一个并发位；位子满了就直接告诉调用方「没跑」。
 *
 * 满了不排队：排队只是把线程池的拥塞挪进事件循环，客户端最后拿到的是一个
 * 超时而不是一句话。`finally` 释放，保证 KDF 抛错时位子不会泄漏。
 */
export async function runInVerificationSlot<T>(
	run: () => Promise<T>
): Promise<VerificationSlotResult<T>> {
	if (inFlightVerifications >= MAX_CONCURRENT_VERIFICATIONS) {
		return { kind: "saturated" };
	}
	inFlightVerifications += 1;
	try {
		return { kind: "ran", value: await run() };
	} finally {
		inFlightVerifications -= 1;
	}
}

/**
 * 记一次失败。**用户名不存在、口令错、账号停用三种失败都要记**：口径一旦
 * 分叉，「哪种失败会触发退避」本身就成了用户名是否存在的旁路。
 */
export function recordLoginFailure(key: LoginAttemptKey): void {
	const now = Date.now();
	const pairKey = pairKeyOf(key);
	const record = pairRecords.get(pairKey);
	if (record === undefined) {
		if (pairRecords.size < MAX_TRACKED_PAIRS) {
			pairRecords.set(pairKey, {
				blockedUntil: 0,
				consecutiveFailures: 1,
				lastSeenAt: now,
			});
		}
		return;
	}
	record.consecutiveFailures += 1;
	record.lastSeenAt = now;
	record.blockedUntil = now + backoffDelayMs(record.consecutiveFailures);
}

/**
 * 登录成功即清空该 (IP, 用户名) 的失败计数。
 *
 * 不顺手清 IP 窗口：那一维是速率上限而不是惩罚，登录成功并不说明这个地址
 * 接下来就该被允许每分钟再来一百次。
 */
export function recordLoginSuccess(key: LoginAttemptKey): void {
	pairRecords.delete(pairKeyOf(key));
}

/** 仅供单元测试：把两张表和清扫时钟清干净，让用例之间互不串味。 */
export function resetLoginRateLimitState(): void {
	ipWindows.clear();
	pairRecords.clear();
	lastSweptAt = 0;
	inFlightVerifications = 0;
}
