# @automationstack/sdk（Java）

把自动化测试的结论**批量**写进 automationstack 的测试任务里，并在收工时打出一张
逐条的**对账单**：哪些写进去了、哪些没有、以及每一条没进去的原因。

与 [`../sdk-node`](../sdk-node)、[`../sdk-python`](../sdk-python) 是**同一份规范的三份实现**——
同样的环境变量名、同样的幂等键算法、同样的对账单格式。同一条流水线上跑两种语言的
测试时，不用维护两套 secret，也不用记两套行为。

```
坐标  org.automationstack:sdk:1.0.0
要求  Java 21+
依赖  零。一个都没有。
```

## 目录

- [装](#装)
- [最小用法](#最小用法)
- [接进 JUnit 5](#接进-junit-5)
- [配置](#配置)
- [对账单怎么读](#对账单怎么读)
- [退出码](#退出码)
- [为什么没有依赖](#为什么没有依赖)
- [发版](#发版)

## 装

⚠️ **这个包只发 GitHub Packages，不发 Maven Central。** 所以：

- **不需要 sonatype（Central Portal）账号**，也不需要为 `org.automationstack`
  这个 groupId 做**域名验证**；
- **不需要 GPG 签名**——Central 强制要求 `.asc`，GitHub Packages 不要求，
  于是也就没有「把私钥塞进 CI」这件事；
- 代价是**用户侧要配一次仓库地址和一个 token**，就是下面两步。跟上面省掉的三样比，
  这一次性配置更划算：三样里任何一样过期或失效，都会在你最需要发版的那天卡住你。

### 1. 在 `~/.m2/settings.xml` 里放一个 server

```xml
<settings>
  <servers>
    <server>
      <id>github</id>
      <username>你的 GitHub 用户名</username>
      <!-- 只要 read:packages 权限的 PAT。⚠️ 不要把真 token 提交进版本库。 -->
      <password>${env.GITHUB_TOKEN}</password>
    </server>
  </servers>
</settings>
```

`${env.GITHUB_TOKEN}` 让 Maven 去读环境变量，真值只存在于你的 shell / CI secret 里。
本机跑：

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx   # 占位符，换成你自己的
```

⚠️ **GitHub Packages 的 Maven registry 不接受匿名下载**，公开仓库也一样。
没配 token 的表现是一条 `401 Unauthorized`，不是「找不到包」——看见 401 先回来看这一步。

### 2. 在你项目的 `pom.xml` 里加仓库和依赖

```xml
<repositories>
  <repository>
    <id>github</id>
    <url>https://maven.pkg.github.com/automationstack/automationstack</url>
  </repository>
</repositories>

<dependencies>
  <dependency>
    <groupId>org.automationstack</groupId>
    <artifactId>sdk</artifactId>
    <version>1.0.0</version>
  </dependency>
</dependencies>
```

⚠️ `<repository>` 的 `<id>` 必须与 `settings.xml` 里 `<server>` 的 `<id>`
**一模一样**（这里都是 `github`）。对不上时 Maven 不会提示，它只是不带认证去请求，
然后给你一条 401。

<details>
<summary>Gradle 的写法</summary>

```kotlin
repositories {
    maven {
        url = uri("https://maven.pkg.github.com/automationstack/automationstack")
        credentials {
            username = System.getenv("GITHUB_ACTOR")
            password = System.getenv("GITHUB_TOKEN")
        }
    }
}

dependencies {
    testImplementation("org.automationstack:sdk:1.0.0")
}
```
</details>

## 最小用法

```java
import java.util.List;
import org.automationstack.sdk.*;

var reporter = new AutomationStackReporter();          // 配置全部从 AS_* 环境变量读

reporter.addResult(CaseResultInput.of("AUTO-LOGIN-001", AutomationCaseResult.PASSED));
reporter.addResult(CaseResultInput.of("AUTO-PAY-003", AutomationCaseResult.FAILED,
        "断言失败：期望 ¥128.00，实际 ¥118.00"));

RunOutcome outcome = reporter.finish();                // 到这一步才发网络
```

三件事值得先知道：

1. **`addResult` 只入内存缓冲，不发请求。** 一整轮攒完，`finish()` 一次发出去
   （超过 200 条自动分批，每批一个从同一个 run key 派生的幂等键）。
2. **没有「上报目标」这个参数。** 你没法指定写进哪个测试任务——归属由用例的
   `sourceRef` 反查，一条结果可以同时落进多个未提交的任务。
3. **`finish()` 一定会把对账单打出来**，然后在「一条都没写进去」时抛
   `IngestEmptyWriteError`。

附件（截图 / 日志）走 `addAttachment`：

```java
reporter.addAttachment(AttachmentInput.ofFile(
        "AUTO-PAY-003", AttachmentKind.SCREENSHOT, "artifacts/pay-003.png"));
reporter.addAttachment(AttachmentInput.ofBytes(
        "AUTO-PAY-003", AttachmentKind.LOG, logText.getBytes(StandardCharsets.UTF_8)));
```

附件**传不上去不会让上报失败**：对象存储没配置时服务端返回 `storageConfigured: false`，
结论照常写进去，对账单里会说明这次降级。

## 接进 JUnit 5

`org.automationstack.sdk.junit5` 是一层**薄壳**，只做注册与收集：

```java
import org.automationstack.sdk.junit5.AutomationStack;
import org.automationstack.sdk.junit5.AutomationStackExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

@ExtendWith(AutomationStackExtension.class)
class CheckoutTest {

    @Test
    @AutomationStack("AUTO-LOGIN-001")   // 这个字符串就是 sourceRef
    void loginWithSmsCode() {
        // ……你原来的测试，一个字都不用改
    }

    @Test                                 // 没标注解 = 不上报
    void healthCheck() {
    }
}
```

`@ExtendWith` 也可以标在你自己的测试基类上，标一次全仓库生效。

| JUnit 里发生的事 | 上报的结论 |
| --- | --- |
| 通过 | `passed` |
| 断言失败 / 抛异常 | `failed` |
| `@BeforeEach` / `@BeforeAll` 炸了 | `blocked`（用例**没跑起来**，不是被测功能失败） |
| `Assumptions.assumeTrue(false)` | `skipped` |
| `@Disabled` | `skipped` |
| `@AfterEach` 炸了 | 不改结论（断言已经跑完了） |

- **没标 `@AutomationStack` 的用例不上报**，但也不静默：收工时会说一句有几条没标。
  不是所有测试都对应平台上的一条用例，整批发过去只会让它们挤满对账单的「未匹配」。
- 失败消息超过 `MAX_INGEST_COMMENT_LENGTH` 时，完整堆栈会自动转成一个 `log` 附件。
- 想临时关掉上报：`-Dautomationstack.enabled=false`。缺 `AS_TOKEN` 时也不会让构建红，
  只打一行说明——本机跑测试的人没配是常态。
- 一条都没写进去时，薄壳会让**测试计划失败**，Surefire / Gradle 自己就会让构建非零退出。
  它**不碰**进程级的 `ExitSignal`（下面「退出码」那节解释了为什么）。

⚠️ **配置要在进程之外导进环境**：Java 改不了自己进程的环境变量，
没有 Node 的 `--env-file` 或 Python 的 `os.environ[...] = ...` 那种东西。

```bash
set -a && . ./.env && set +a && mvn test
```

（编程式用法有个 seam：`AutomationStackReporter.builder().env(yourMap)`，
你可以自己读一份 `.env` 喂进去。薄壳那条路没有这个 seam，因为 reporter 是它自己建的。）

## 配置

**只有三样，而且三样都跨迭代不变**，配一次跟着仓库走：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `AS_TOKEN` | ✅ | 平台上建的个人 token。**明文只显示一次**，库里只存 SHA-256 哈希 |
| `AS_PROJECT` | ✅ | 这个仓库对应的项目 id |
| `AS_BASE_URL` | ✅ | 平台地址，例如 `https://qa.example.com` |
| `AS_BRANCH` | | 写进本次上报的元信息 |
| `AS_COMMIT_SHA` | | 同上 |
| `AS_CI_URL` | | 同上 |
| `AS_IDEMPOTENCY_KEY` | | **给 CI 重试用**：retry 是新进程，不给它就会被当成两轮新上报 |

**没有 `runId`。** 配置里写死 runId 意味着每个迭代都要有人去改 CI 变量，
这种手动步骤第一次会忘、第二次就没人用了。

显式参数优先于环境变量：

```java
var reporter = AutomationStackReporter.builder()
        .baseUrl("https://qa.example.com")
        .projectId(projectId)
        .token(token)
        .runIds(List.of(runId))   // 可选的收窄白名单，刻意不做成环境变量
        .build();
```

## 对账单怎么读

```
[automationstack] 上报对账单（execution 6f1c…）
写入 《登录与结算 冒烟》    12 条
写入 《全量回归 第二轮》     9 条
跳过 2 条（已有人工结果，未开启覆盖）：AUTO-PAY-003 @《登录与结算 冒烟》、…
未匹配 1 条（用例不存在或不属于本项目）：AUTO-NOT-ON-PLATFORM-999
越界 1 条（没有未提交的测试任务收它）：AUTO-SEARCH-005
附件 已登记 3 个（上传 3 个）
```

四类**分开列，一条不省略**，理由是**服务端原文，SDK 一个字都不改写**。
因为下一步动作完全不同：「未匹配」要去补 sourceRef，「越界」要去建测试任务，
「跳过」要去决定要不要 `overwriteManual`。糊成一句「上报失败」等于什么都没说。

## 退出码

**一条都没写进去时，`finish()` 抛 `IngestEmptyWriteError`，同时在
`ExitSignal` 上留一个进程级记号。** 两条通道都要，因为异常在测试框架的钩子里
常常被吞掉，而 CI 里最危险的失败不是红，是**绿着但什么都没写**。

Java 上「让退出码非零」这件事没有干净的库内做法：Node 有 `process.exitCode = 1`
这种软标记，Java 没有；能真正决定退出码的只有 `System.exit()` 和 `Runtime.halt()`，
而在库里调它们会把宿主整个掐掉——Surefire 的报告没写完、JaCoCo 没 dump、
用户的 `@AfterAll` 没跑，人拿到一个没有测试报告的构建，而原因恰恰印在被掐掉的输出里。

所以**库只记录，退出由入口负责**：

```java
public static void main(String[] args) {
    var reporter = new AutomationStackReporter();
    // ……
    try {
        reporter.finish();
    } catch (IngestEmptyWriteError error) {
        System.err.println(error.getMessage());
    }
    System.exit(ExitSignal.exitCode());   // 在自己的进程里调 exit 是正当的
}
```

跑在 JUnit 下的人不用管这件事：薄壳会把它翻译成一次测试失败，
Surefire / Gradle 用自己的机制决定退出码。

## 为什么没有依赖

测试上报 SDK 的依赖会**进 QA 的测试工程**，而那是全公司依赖最难动的地方之一。

| 常见做法 | 这里的做法 | 为什么 |
| --- | --- | --- |
| Jackson / Gson | 手写编码器 + 解析器（约 400 行） | **Java 生态里最典型的坑就是 JSON 库撞版本**。你的工程里已经有一个 Jackson，我钉死一个大版本就等于两边升级互相等。ingest 的报文形状是完全已知的一小块，写 400 行把这个风险彻底消掉是划算的——跟「SDK 不绑测试框架」是同一个道理 |
| OkHttp / Apache HttpClient | JDK 内置的 `java.net.http.HttpClient` | Java 11 起就有，够用 |
| AWS SDK | 预签名 URL 上就是一次普通 PUT | 引 AWS SDK 会给用户的构建加几十兆，换来的能力这里一样都用不上 |
| SLF4J | 对账单直接走 stdout | 对账单不是日志，是这次上报的**结果**，不该被谁的 logging 配置改掉一个字，更不该因为「测试阶段把 root logger 关了」而整个消失 |

`junit-jupiter-api` 在 `pom.xml` 里是 **`provided`** 作用域：薄壳编译要它，
但 provided **不传递**，不用 JUnit 的人拿到本包时 classpath 上不会多出任何东西。

## 发版

只发 GitHub Packages：

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx   # 需要 write:packages
mvn clean deploy
```

`<distributionManagement>` 已经指向 `https://maven.pkg.github.com/automationstack/automationstack`，
认证同样走 `settings.xml` 里 id 为 `github` 的那个 `<server>`。

再说一遍，因为这是选 GitHub Packages 换来的：**不需要 sonatype 账号、
不需要 GPG 签名、不需要域名验证。** 没有 `maven-gpg-plugin`，
没有 `central-publishing-maven-plugin`，CI 里也没有私钥。

## 本地开发

```bash
mvn clean test     # 全部测试，不连网（网络层在测试里被替换成假 transport）
mvn clean install  # 装进本地仓库，examples/jdk 从这儿解析
```

测试里有两组是**防漂**用的，它们红了通常不是你写错了：

- `ContractParityTest` 把 `../sdk-node/src/*.ts` 当文本读，逐个比契约常量。
  它红了说明 Node 那边改了契约——**要改的是这个包的常量，不是这个测试**。
- `IdempotencyTest` 里的 `NODE_GOLDEN` 是从 Node 版跑出来的基准值，
  Python 那边也抄了一份。三家算不出同一个键，同一轮重试就会被当成两轮新上报。
