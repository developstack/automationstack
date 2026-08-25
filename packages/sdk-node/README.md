# @automationstack/sdk

把一轮自动化测试的结果**批量**上报到 automationstack 的 ingest 端点，原样打印对账单，
按「有没有写进去」决定退出码。

- **零运行时依赖。** 只用 `fetch` 与 `node:fs`，附件走预签名 PUT（D28），不引 S3 SDK。
- **不认识任何测试框架。** `dependencies` / `peerDependencies` 里没有 wdio、playwright
  或别的框架。框架升级时改的是你仓库里那十几行搬运代码，不用等我们发版。

## 安装

本包发在 **GitHub Packages 的 npm registry**（`https://npm.pkg.github.com`），不在
npmjs.org 上——仓库是私有的，包也是私有的。所以 `npm i @automationstack/sdk` 直接跑
会 404：默认 registry 上没有这个名字。装之前要做两件事：**把 scope 指到 GitHub 的
registry**，再**给它一个能读的 token**。

在你自己的项目根放一份 `.npmrc`：

```ini
# 只把 @automationstack 这个 scope 指过去。不要写 registry=（不带 scope 的那种）：
# 那会把你**所有**依赖都拿去 GitHub Packages 上找，而它并不镜像 npmjs.org。
@automationstack:registry=https://npm.pkg.github.com

# token 从环境变量读，不要把它写进这个文件——.npmrc 是要进版本库的。
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

token 用一个 **classic personal access token**，勾选 `read:packages` 一个权限就够
（私有仓库的包还需要 `repo`）。GitHub Packages 的 npm registry 至今只认 classic PAT，
细粒度 token 在这里是无效的。把它放进你本地的 shell profile 或 CI 的 secret：

```sh
export GITHUB_PACKAGES_TOKEN=ghp_你的token
```

然后照常装：

```sh
npm i @automationstack/sdk     # pnpm / yarn 同理，它们读同一份 .npmrc
```

### 在 CI 里装

跑在 GitHub Actions 上的话**不需要建任何 PAT**——每个 job 自带的 `GITHUB_TOKEN`
就能读同一个 org 下的包，前提是给 job 开 `packages: read`：

```yaml
permissions:
  contents: read
  packages: read

steps:
  - uses: actions/checkout@v5
  - uses: actions/setup-node@v6
    with:
      node-version: "24"
      registry-url: https://npm.pkg.github.com
      scope: "@automationstack"
  - run: npm ci
    env:
      # setup-node 已经写好 .npmrc，这里只要把 token 喂进去。
      NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

跑在别处（GitLab CI、Jenkins、本地 runner）就还是走上面那个 PAT，把它设成
`GITHUB_PACKAGES_TOKEN` 注进环境。

### 发版（维护者）

改 `package.json` 的 `version`，合进 main，然后打一个 `sdk-node-v<版本号>` 的 tag
推上去，`.github/workflows/publish-sdk.yml` 会跑完类型检查与测试再发布。
tag 里的版本号与 `package.json` 对不上时那条流水线会直接失败——npm 的版本号发出去
就改不了，这道闸拦的是「Releases 页写着一个版本、registry 上躺着另一个」。

## 配置

只有三样，全部跨迭代不变（§5.1 / D31）：

```
AS_TOKEN     = as_xxxxx     个人 API token（在平台的 /api-tokens 里建，明文只显示一次）
AS_PROJECT   = <projectId>  这个仓库对应的项目 id
AS_BASE_URL  = https://qa.example.com
```

**没有第四样，尤其没有 `runId`。** 结论写进哪个测试任务由用例自己的 `sourceRef`
解析（§3.7）：这个迭代的任务建好了、用例勾进去了，脚本跑完就一定有地方落。
配置里写死一个 runId 意味着每个迭代都要有人去改 CI 变量，第一次会忘，第二次就没人用了。

可选：`AS_BRANCH` / `AS_COMMIT_SHA` / `AS_CI_URL` 只影响失败清单上的「怎么复现」；
`AS_IDEMPOTENCY_KEY` 是给 **CI 重试**用的（见下）。

## 用法

```ts
import { AutomationStackReporter } from "@automationstack/sdk";

const reporter = new AutomationStackReporter();

// 跑测试的过程中只入缓冲，一个网络请求都不发。
reporter.addResult({ result: "passed", sourceRef: "PAY-LOGIN-001", durationMs: 1820 });
reporter.addResult({
	result: "failed",
	sourceRef: "PAY-LOGIN-002",
	message: "expected 200, got 500",
});
reporter.addAttachment({
	filePath: "./screenshots/pay-login-002.png",
	kind: "screenshot",
	sourceRef: "PAY-LOGIN-002",
});

// 全部跑完之后调一次：批量提交、打印对账单、决定退出码。
await reporter.finish();
```

输出（§7.2 第 3 条）：

```
[automationstack] 上报对账单（execution 5c1e…）
写入 《v2.3 回归》      78 条
写入 《支付模块专项》   12 条
跳过 1 条（已有人工结论）：PAY-CART-007 @《v2.3 回归》
越界 1 条（不在任何未提交任务的范围内）：PAY-CART-031
```

`writtenTo` 是「这轮结果扩散到了哪些任务」的**唯一披露点**（D34）——一次上报写进三个
任务，日志里就有三行。三类拒绝逐条列出，理由是**服务端原文**，SDK 不概括。

一条都没写进去时 `finish()` 抛 `IngestEmptyWriteError` 并把 `process.exitCode`
置为 1（§7.2 第 4 条）。静默成功是最坏的情况：QA 以为结果进去了，实际一条都没写。

## 幂等

一次进程启动生成一个键，分批时每批的键从它确定性派生，重试算出来的还是同一个（§5.2）。

CI 的 retry 是**新进程**，「一次进程一个」在那里失效——把 CI 的 job/attempt id 喂进
`AS_IDEMPOTENCY_KEY`，同一轮被重跑时服务端才认得出来。

## 接到你的测试框架上

下面两段是**示例代码，不是依赖**。抄进你自己的仓库，框架升级了改这一段就行。

### WebdriverIO

`wdio.conf.ts` 里挂一个自定义 reporter（它自己的 `sourceRef` 从用例标题或
自定义元数据里取——那是你的约定，我们不猜）：

```ts
import WDIOReporter from "@wdio/reporter";
import { AutomationStackReporter } from "@automationstack/sdk";

export default class AutomationStackWdioReporter extends WDIOReporter {
	private readonly reporter = new AutomationStackReporter();

	onTestEnd(test) {
		const sourceRef = test.title.match(/\[([A-Z0-9-]+)\]/)?.[1];
		if (!sourceRef) {
			return; // 没标 sourceRef 的用例不上报，免得整批进 unmatchedCases
		}
		this.reporter.addResult({
			durationMs: test._duration,
			message: test.error?.message ?? null,
			result: test.state === "passed" ? "passed" : test.state === "skipped" ? "skipped" : "failed",
			sourceRef,
		});
	}

	async onRunnerEnd() {
		await this.reporter.finish();
	}
}
```

### Playwright

`playwright.config.ts` 的 `reporter` 里挂一个实现了 `Reporter` 接口的对象：

```ts
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { AutomationStackReporter } from "@automationstack/sdk";

export default class AutomationStackPlaywrightReporter implements Reporter {
	private readonly reporter = new AutomationStackReporter();

	onTestEnd(test: TestCase, result: TestResult) {
		const sourceRef = test.annotations.find((a) => a.type === "sourceRef")?.description;
		if (!sourceRef) {
			return;
		}
		this.reporter.addResult({
			durationMs: result.duration,
			message: result.error?.message ?? null,
			result: result.status === "passed" ? "passed" : result.status === "skipped" ? "skipped" : "failed",
			sourceRef,
		});
		for (const attachment of result.attachments) {
			if (attachment.path) {
				this.reporter.addAttachment({
					contentType: attachment.contentType,
					filePath: attachment.path,
					kind: attachment.contentType.startsWith("video/") ? "video" : "screenshot",
					sourceRef,
				});
			}
		}
	}

	async onEnd() {
		try {
			await this.reporter.finish();
		} catch {
			return { status: "failed" as const }; // 一条都没写进去 → 整轮判失败
		}
		return;
	}
}
```

## 不做的事

- **不做预检。** 正常路径只有一次 `POST /ingest/executions`。`GET /ingest/runs`
  是留给人排查用的，SDK 不在正常路径上调它（§7.2 第 5 条）。
- **不给附件去重。** 一条结果可能写进多个任务，presign 会按解析出的 run_case
  逐个返回 URL，拿到几个就传几次同一个文件——这是 object key 规则要求的（§5.6）。
- **不让附件拖垮上报。** R2 未配置或配额用完时附件降级，结论照常写入、正常退出。
