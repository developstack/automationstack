# Java 示例：一轮 JUnit 5 结果的完整上报

这份示例回答的是一个很具体的问题：**我的 JUnit 已经在跑了，怎么让它的结论落进
平台的测试任务里，并且我怎么知道到底落进去了没有。**

它只有两个依赖：`org.automationstack:sdk` 和 `junit-jupiter`。没有 Jackson、
没有 OkHttp、没有 Allure——SDK 的运行时依赖是**零**（JSON 是手写的，HTTP 用 JDK 内置的
`java.net.http.HttpClient`）。QA 的测试工程是全公司依赖最难动的地方之一，
多一个依赖就多一次版本冲突。

跟 [`../nodejs`](../nodejs)、[`../python`](../python) 是**同一套种子数据、同一份对账单契约**，
演示的也是同一组事情，只是这边走 JUnit 5 扩展。

## 目录

```
examples/jdk
├── pom.xml
├── src/main/java/org/automationstack/example/
│   ├── CiIdempotencyKey.java      # 把 CI 的 job-attempt 折成合法 UUID
│   ├── EnvFile.java               # 30 行的 .env 读取器（不为读三行配置装第四个包）
│   ├── ReportEmptyWriteMain.java  # 第二入口：「一条都没写进去」的非零退出；**不 import JUnit**
│   └── ReportRunMain.java         # 第一入口：完全不带测试框架地上报一轮
└── src/test/java/org/automationstack/example/
    └── CheckoutTest.java          # 6 条用例：5 条标了 sourceRef（1 条故意失败、2 条跳过）+ 1 条没标
```

## 跑之前

先按 [`../README.md`](../README.md) 的「共同前置」把库起起来、迁移、种数据、起服务。

### 装 JDK 与 Maven

```bash
java -version   # 期望 21 或更高
mvn -version
```

### 把 SDK 装进本地仓库

示例跟着仓库走，从本地路径解析而不是从 GitHub Packages 下载——改了 SDK 立刻能在
示例里看见效果，不用先发一个 tag：

```bash
mvn -f ../../packages/sdk-java/pom.xml clean install
```

你自己的项目请照 [核心包 README](../../packages/sdk-java/README.md) 那样从
GitHub Packages 装。

### 填 .env

```bash
cp .env.example .env
# 把 pnpm db:seed-automation-demo 打印的 AS_PROJECT / AS_TOKEN 填进去
```

种子脚本打印的那段抬头写的是 `examples/nodejs`，三行内容对这份示例**一模一样**：
环境变量名 Node / Python / Java 三边逐字一致。

**AS_TOKEN 的明文只在创建那一刻打印一次。** 库里存的是 SHA-256 哈希，
没有任何接口能把明文取回来；丢了就重新跑一次种子生成一个。

## 跑

### 1. JUnit 那条路径

```bash
set -a && . ./.env && set +a
mvn test
```

⚠️ **那一句 `set -a && . ./.env` 不是可以省的。** Java 改不了自己进程的环境变量——
`System.getenv()` 返回的是只读视图，JDK 里没有 `os.environ["X"] = ...` 这种东西，
也没有 Node 的 `--env-file`。所以配置只能在**进程之外**导进来。
（编程式用法有 seam：`builder().env(EnvFile.load())`，下面那两个入口走的就是这条。
薄壳那条路没有，因为 reporter 是它自己建的。）

没导也不会红：薄壳会打一行「automationstack：未上报（缺少 AS_TOKEN…）」然后什么都不做。
本机跑测试的人没配是常态，不该因此让他的构建红掉。

跑完你会看到 JUnit 自己的输出，然后是对账单。接线只有 `CheckoutTest` 上的那一行
`@ExtendWith(AutomationStackExtension.class)`，测试本身一个字都没为上报改过。

### 2. 完全不带测试框架的那条路径

```bash
mvn -q exec:java -Dexec.mainClass=org.automationstack.example.ReportRunMain
echo $?
```

这个入口里**没有 JUnit**，结果是硬编码的。它要证明的是「SDK 不绑测试框架」
不是修辞：你手上无论是什么在产结论，搬进 `CaseResultInput` 的那几行代码
留在你自己的仓库里，换框架时改的是那几行。

### 3. 「绿着但什么都没写」那条路径

```bash
mvn -q exec:java -Dexec.mainClass=org.automationstack.example.ReportEmptyWriteMain
echo $?   # 期望：1
```

它上报一批平台上根本不存在的 sourceRef。服务端返回的是 **200** 加一份
`writtenTo` 为空、`unmatchedCases` 逐条列出的对账单——状态码表达「请求本身有没有问题」，
对账单表达「业务上发生了什么」。SDK 据以报错的信号是对账单，不是状态码。

CI 里最危险的失败不是红，是绿着但什么都没写。这个入口把那条路径显式跑一遍，
让你能亲眼看见退出码是 1。

## 这份示例证明了什么

1. **接线只有一行。** `@ExtendWith(AutomationStackExtension.class)`，
   标在测试类或你的测试基类上。JUnit 没有自动注册这回事，不写就完全不生效——
   这也是薄壳能和核心包同处一个 artifact 的原因（pytest 那边必须拆成独立发行包，
   因为 pytest 的插件是 entry point 自动注册的）。
2. **归属只认 `sourceRef`。** 代码里没有任何办法指定「写进哪个测试任务」。
3. **一轮测试只发一个请求。** 结果全程攒在内存里，跑完一次
   `POST /ingest/executions`（超过 200 条才分批）。全程不做预检。
4. **没标注解的用例不上报**，但收工时会说一句有几条没标。
   `CheckoutTest#healthCheckEndpointReturnsOk` 就是那一条。
5. **`@Disabled` 和 assumption 上报成 `skipped`，setup 炸了上报成 `blocked`**——
   不是 `failed`。用例没跑起来时报 failed，会让失败清单上多出一条查不动的假失败。
6. **一条都没写进去时进程非零退出。** 见上面第 3 条路径。

## 关于附件

`ReportRunMain` 会给失败那条挂一个 log 附件（以及 `artifacts/` 下有截图时挂上截图）。
附件走「预签名 → PUT → 登记」三步，需要服务端配好对象存储（R2）。
**没配也不会让上报失败**：服务端返回 `storageConfigured: false`，SDK 跳过附件、
把结论正常写进去，并在对账单旁边说明这次降级。示例默认就跑在这种降级状态下——
那是预期行为，不是出错。
