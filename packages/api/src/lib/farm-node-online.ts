/**
 * 「这台节点现在在不在线」的判据。
 *
 * 节点没有长连接可查——控制面与 node-agent 是两个进程、多半还在两台机器上
 * （与 apps/farm 同一条约束，见 routers/farm.ts 的文件头）。唯一的线索是
 * agent 每隔一拍打上来的心跳，落在 `farm_node.lastSeenAt` 这一列上。
 * 所以「在线」只能是一句推断：**最近一次心跳离现在够近**。
 *
 * 提成一个带单测的纯函数而不是在 handler 里写一行减法，是因为这条判据里
 * 藏着一个容易改坏的比例关系（见下面两个常量）：改窗口的人如果看不见
 * 「三拍」这个理由，很容易顺手改成「30 秒才算在线」，那样每一次正常的网络
 * 抖动都会让整张表闪一次红。
 */

/**
 * node-agent 的心跳间隔。这里是**它那边的约定在这边的副本**，改动要两边一起改
 * （集成波要核对的第一件事）。
 */
export const NODE_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * 容三拍。
 *
 * 一拍太紧：心跳与请求各自的抖动加起来就能越过 30 秒，界面会在节点其实好好的
 * 时候把它画成离线，而「离线」这两个字会让管理员跑去重启一台没坏的机器。
 * 两拍够用但没有余量——正好丢一拍再赶上一次慢请求就翻。三拍（90 秒）是
 * 「丢一拍不慌、丢两拍才报」，代价是节点真的死掉时最多晚 90 秒才显示出来，
 * 而这一页不是故障告警面板，晚一分半是可以接受的。
 */
const HEARTBEAT_TOLERANCE_TICKS = 3;

/** 在线窗口：90 秒。 */
export const NODE_ONLINE_WINDOW_MS =
	NODE_HEARTBEAT_INTERVAL_MS * HEARTBEAT_TOLERANCE_TICKS;

/**
 * @param lastSeenAt 最近一次心跳；`null` = 从建号起就没上报过（多半是 token
 *   还没填进 agent），这种一律算离线——没有心跳就没有任何在线的证据。
 * @param now 由调用方传进来，这个函数自己不读时钟：一次 `list` 里的所有行
 *   必须拿同一个「现在」去比，否则排在前面的行判据比后面的严一点点，
 *   而这种差别恰好会在窗口边界上把两台一起心跳的节点画成一在线一离线。
 *
 * 未来的时间戳（节点机器的时钟快了）照样算在线：钳它没有意义，
 * 一台正在上报的机器就是在线的，时钟偏斜是另一件事。
 */
export function isNodeOnline(lastSeenAt: Date | null, now: number): boolean {
	if (lastSeenAt === null) {
		return false;
	}
	return now - lastSeenAt.getTime() <= NODE_ONLINE_WINDOW_MS;
}
