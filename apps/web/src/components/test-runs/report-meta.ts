/**
 * 报告页的展示元数据与纯函数。
 *
 * 单独成文件，是因为这一页最容易出错的几件事都不该散落在各张卡里：
 *
 * 1. **用户手填的缺陷 URL**。Jira 未配置时 `defectUrl` 是纯文本输入（D9），
 *    也就是一段用户可控字符串。直接塞进 `href` 就能拿到 `javascript:` 执行。
 * 2. **自动提交日期的精度**。它是预告不是定时器，写到分钟会骗人。
 *
 * 率的**口径**在 packages/db 的 `test-run-metrics-core.ts`（前端一处都不重算），
 * 率的**格式化**在同目录的 `rate-format.ts`（列表页也要用，不能挂在报告页下面）。
 * 这里不再转手 re-export 它们：要用就直接从 `rate-format.ts` 取，
 * 免得将来有人以为「格式化是报告页的东西」。
 */
import type { AppRouterClient } from "@automationstack/api/routers/index";
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

/**
 * 报告页拿到的数据形状。
 *
 * 从 oRPC 客户端类型反推，而不是去 `@automationstack/db/repositories/…` 里
 * import 那个 interface：本仓库的前端只从 `@automationstack/api/*` 取视图类型
 * （schema 的行类型除外），跨过 api 层直接依赖 repository 会让「后端换了实现、
 * 前端还钉在旧结构上」这件事编译期发现不了。
 */
export type TestRunReportView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["report"]>
>;

export type ReportModuleStat = TestRunReportView["modules"][number];
export type ReportPriorityStat = TestRunReportView["priorities"][number];
export type ReportFailedCase = TestRunReportView["failedCases"][number];

/**
 * 四种结论的展示次序：通过 → 失败 → 阻塞 → 跳过。
 *
 * 不含 `untested`——它不是一个结论，而是「还没测」。在环形图上它是轨道段，
 * 在完成率里它是分子的补集，在通过率里它压根不参与。把它混进这个数组，
 * 迟早会有人拿这个数组去算通过率的分母。
 */
export const CONCLUDED_RESULTS: readonly TestRunCaseResult[] = [
	"passed",
	"failed",
	"blocked",
	"skipped",
];

/**
 * 结论在图上的取色，以及图例里那枚色块的对应类。
 *
 * 主题的 `--chart-*` 是一套纯灰色阶（C=0），相邻两档互比只有 1.33~1.65:1
 * （实测值见 packages/ui/src/styles/theme.css），**颜色在这一页不承载任何信息**：
 * 四个结论都要上色，2..5 四档正好用尽，没有「隔一档取色」的余地。真正区分它们的
 * 是紧邻的中文标签与数字，色块只是让图与图例能对上号的冗余编码。
 * 这也是本页每张图都必须配一份文字/表格等价物的直接原因。
 *
 * `untested` 走 `--chart-1`：它压卡片只有 1.48:1，达不到 WCAG 1.4.11 的 3:1，
 * 只能当「整圆有多大」的轨道，不能承载数据系列——而「未测」恰好就是那段轨道。
 */
export const RESULT_CHART_COLORS: Record<
	TestRunCaseResult,
	{ color: string; swatch: string }
> = {
	blocked: { color: "var(--chart-3)", swatch: "bg-chart-3" },
	failed: { color: "var(--chart-4)", swatch: "bg-chart-4" },
	passed: { color: "var(--chart-5)", swatch: "bg-chart-5" },
	skipped: { color: "var(--chart-2)", swatch: "bg-chart-2" },
	untested: { color: "var(--chart-1)", swatch: "bg-chart-1" },
};

/**
 * 只有 http/https 才允许进 `href`。
 *
 * `defectUrl` 在 Jira 未配置时是用户手填的纯文本（D9 的优雅降级），
 * 也就是一段完全由用户控制的字符串。`javascript:alert(1)` 是一个合法的 URL，
 * 只有协议白名单挡得住它；判空、判长度、判是否 `startsWith("http")`
 * 都会被 `jAvAsCrIpT:` 之类的写法绕过（`new URL()` 会把协议规范化成小写）。
 * 判定为不安全时调用方一律降级成纯文本展示，而不是悄悄丢掉——
 * 那毕竟是有人手填进去的内容，读报告的人有权看到它长什么样。
 */
const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function isSafeHttpUrl(value: string | null): boolean {
	if (value === null || value === "") {
		return false;
	}
	try {
		return SAFE_URL_PROTOCOLS.has(new URL(value).protocol);
	} catch {
		// 压根不是个 URL（用户填了「见群里聊天记录」之类），同样按纯文本处理。
		return false;
	}
}

/**
 * 自动提交日期。只到日不到分：这是一个「大约那天会自动锁」的预告，
 * 精确到分钟会让人以为那一刻会有个定时任务准点跑——实际是惰性结算，
 * 没人访问就不会翻状态（plan §2.5）。
 */
const AUTO_SUBMIT_DATE_FORMAT = new Intl.DateTimeFormat("zh-CN", {
	dateStyle: "long",
});

export function formatAutoSubmitDate(value: Date | string): string {
	return AUTO_SUBMIT_DATE_FORMAT.format(new Date(value));
}
