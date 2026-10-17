## 先接上这三步

1. **签一枚 token**——上面「API Token」那一格，`as_` 开头。
2. **跑一次安装脚本**——它装两个 skill，并按你本机装了哪些 agent 分别写好 MCP 配置。
3. **`export AS_TOKEN=…` 之后重启 agent**，让它调一次 `list_projects`：能列出项目就算接上了。

> 前两步是**一次性配置**，装完不必再回来。日常真正在用的只有下面这条端点和十一个工具——其中最要紧的一条是：**动笔写用例之前先调 `read_cases` 把平台上已有的用例正文读进来**，理由见「动笔之前」那一节。

---

## MCP 端点

平台不再内置在线 AI，改为把用例读写开成一个 MCP 接口，由你自己的本地 agent 接进来对话。

```text
{{MCP_URL}}
```

**Streamable HTTP，无状态。** 每个请求都要带 `Authorization: Bearer <你的 API Token>`；token 在上面「API Token」那一格生成，`as_` 开头。

> ⚠️ 接进去之后，agent 的身份与权限**就是这枚 token 所属用户的身份与权限**——没有「MCP 默认身份」，也不会静默降级成只读。

- 没带或带错 Bearer 会直接拿到 **HTTP 401**，且一个工具都不会注册，`tools/list` 也是空的。**「一个平台工具都看不见」与「服务端没起」是同一种表现**，先查 token 再查端口。
- 权限不足**不是 HTTP 403**：服务端把它包成了普通的工具结果（HTTP 200，`isError` 为 `true`，正文是 `Error: <原因>`）。所以每次调用都要看返回里的 `isError`，别因为「没报错」就当成功。
- 拿到 `Error: 你不是该项目的成员` 时正解是去找项目 owner 把 token 主人加进成员，**不是换个项目继续写**。

---

## 十一个工具

按「你什么时候会用到它」分六组，不是十一件等权重的事。

### 一次性：找到项目

- **`list_projects`** —— 列出你可见的项目。**任何用例任务的第一个调用**：它同时是连通性自检，一次成功返回就说明端点通、token 有效、看得到哪些项目。项目的 `description` 是团队自己维护的自由文本，常写着这个项目的约定，值得读一眼。
- `create_project` —— 只在 `list_projects` 里确实没有合适项目、且用户同意新建时才调。**优先复用已有项目**。

### 动笔之前：先把平台读进上下文

这一组是本轮改造的重点，也是「生成的用例和现有风格对不上」的解药。

#### `read_cases` —— 唯一能读到用例**正文**的工具

模型看不见平台里的数据。没读过已有用例就开始写，产出必然是教科书味的通用用例：跟这个项目已有的几百条对不上，还会把已经存在的用例换个说法重写一遍。

它一次解决三件事：

- **对齐写法**——步骤的颗粒度、命名、预期结果写到多具体，只能从正文里看出来。
- **查重**——判断两条中文用例是不是一个意思，只能靠读正文。
- **找缺口**——配合 `get_module_tree` 的覆盖数字，决定该补哪儿。

| 参数 | 用来 |
| --- | --- |
| `moduleId` + `includeDescendants` | 只看某个模块（可含其子模块） |
| `keyword` | 用例名子串 |
| `status` / `priority[]` / `tags[]` | 按 `draft`/`active`/`deprecated`、`P0`–`P3`、标签（任一命中）筛 |
| `sourceRefPrefix` | 前缀匹配 `sourceRef`。填 `gen:<需求标识>#` 就是「上一轮为这个需求生成了什么」 |
| `detail` | `summary`（默认，**不含正文**）/ `full`（额外带 `preconditions` 与 `steps`） |
| `page` / `pageSize` | 翻页 |

返回 `{detail, items[], page, pageSize, total}`。

> ⚠️ `detail: "full"` 每页默认 **10** 条、最多 **20** 条，这个上限是有意压低的：用例正文很占地方，一次拉一百条正文能吃掉本地 agent 半个上下文窗口，「上下文饥饿」就换成了「上下文中毒」。**先用 `summary` 看清有哪些，再对真正要读的模块拉 `full`。**

#### 另外两件配套的读

- **`get_module_tree`** —— 模块树 + 每个模块已有多少覆盖，一次返回两种形态：给人看的缩进大纲，和扁平 JSON（`{id, name, parentId, depth, caseCount, activeCaseCount, gap}`）。计数**含子模块**（中间层模块在本产品里就是文件夹，用例通常挂叶子上），`gap` 是 `empty` / `no-active` / `null`，大纲里对应标成 `← 零用例` / `← 无 active 用例`。它把「加几条用例」变成一个关于**加在哪**的决定。它不返回用例本身，那是 `read_cases` 的事。
- **`list_case_tags`** —— 项目里已经在用的标签词表（去重排序）。**新用例的标签优先落在这张表里**：标签是自由文本，agent 每轮自己造一套说法（`登录` / `用户登录` / `auth`），标签筛选就废了，事后要人手工收拾。返回空数组是「这个项目还没有标签」，不是调用失败。

### 写入：只有一条通道

- **`ensure_module_path`** —— 按名字路径从根往下补齐模块，返回最深一级的 `moduleId`（拿去当导入用例的 `moduleId`）和这次真正新建的 `createdModuleIds`。**幂等**：同名即复用，重跑不会造出第二棵树。
- **`import_test_cases`** —— 唯一的写入口，搬运存量用例和写新设计的用例走的是同一条。每条用例要有 `moduleId`、`name`，并且**应当带一个项目内唯一且稳定的 `sourceRef`**——它是幂等键，重跑靠它决定更新还是跳过。逐条独立校验执行：某一条写坏了只会进 `errors`（带**批内下标**和出错字段），不会拖累同批其它行。返回 `{created[], skipped[], errors[]}`。

> ⚠️ 两个默认值决定了你事后要不要返工。**新写的用例一律 `status: "draft"`**——平台的用例列表按 status 过滤，`draft` 就是「待评审」那一格；直接写 `active` 等于把没人看过的 AI 产出混进正式用例库。**`onDuplicate` 用 `skip`（补漏）或 `overwrite`（需求改了重出一版），别用 `create-anyway`**：它会把 `sourceRef` 置成 `null`，那条用例从此退出幂等体系，以后每次重跑都再复制一份。另注意 `overwrite` **只覆盖内容字段，不会把用例移动到别的模块**。

### 写入截图：三步

- **`create_screenshot_upload`** —— 为一个已有用例的一张图片取得上传地址。迁移 Excel 或 XMind 中的用例时，用它写入步骤的操作截图和预期截图。

MCP 工具的参数是 JSON 文本，不能包含图片的字节。所以写入截图分三步：

1. 调用 `create_screenshot_upload`。给出用例的 `caseId`，以及本地图片的文件名、类型和准确的字节数（`sizeBytes`）。例如用 `wc -c < ./images/login.png` 取得字节数。
2. 把 shell 变量 `FILE` 设为本地图片的路径。然后执行返回的 `curl` 命令。这个命令用 `--upload-file` 上传文件，curl 按文件的大小发送 `Content-Length`。
3. 调用 `import_test_cases`。`onDuplicate` 用 `"overwrite"`，`sourceRef` 用这条用例的 `sourceRef`。在步骤的 `actionScreenshots` 或 `expectedScreenshots` 中写入返回的上传凭证（`uploadToken`）。

第 2 步的命令如下：

```bash
FILE='./images/login.png'
curl --fail --silent --show-error -X PUT -H 'Content-Type: image/png' --upload-file "$FILE" '<返回的 uploadUrl>'
```

第 3 步中的一个步骤如下：

```json
{
  "id": "s1",
  "step": "输入账号和密码，点击登录",
  "expected": "进入首页",
  "actionScreenshots": ["<上传凭证 1>"],
  "expectedScreenshots": ["<上传凭证 2>"]
}
```

规则：

- 每张图片调用一次 `create_screenshot_upload`。上传地址在 5 分钟后过期，上传凭证在 1 小时后过期。
- 上传地址只接受声明的类型和大小。文件的大小与 `sizeBytes` 不同时，存储拒绝上传（HTTP 403）。取得上传地址后，不要修改文件。
- 用其他工具上传时，发送返回的 `headers` 中的所有请求头，并且不要用分块传输（chunked）。
- 只有已有的用例可以写入截图。新用例先用 `import_test_cases` 创建，再用第二次调用写入截图。没有 `sourceRef` 的用例不能用这个方法写入截图。
- 给出的一组截图替换这个步骤原有的整组截图。空列表 `[]` 删除这一组的所有图片。
- 不给某一组时，`id` 相同的步骤保留原有的这一组。
- 每组最多 9 张图片。每个文件最多 10 MB，类型是 png、jpeg 或 webp。这些限制与界面相同。
- 一行最多引用 50 个上传凭证。上传凭证更多时，分几次调用。已经写入的步骤不给截图字段。
- 上传凭证只能用于取得它的那条用例。项目的任何成员都可以调用 `create_screenshot_upload`，权限与 `import_test_cases` 相同。
- 只有取得上传凭证的用户可以使用它。另一个用户使用这个凭证时，这一行进入 `errors`。
- 上传凭证无效或过期、文件没有上传，或者文件与声明的类型和大小不同时，这一行进入 `errors`。错误信息说明原因。
- 被跳过的行不写入截图，`skipped` 中的原因说明这一点。
- `read_cases` 不返回截图。

### 改状态：只改状态，可以撤销

- **`change_case_status`** —— 一次把最多 100 条用例改为 `draft`、`active` 或 `deprecated`，这些用例必须在同一个项目中。只改状态，不改步骤等内容，也不检查版本。一条用例不存在时什么都不改。状态有变化的用例各记录一个新版本；原来就是目标状态的用例不动。返回 `{changed[], unchanged[]}`，`changed` 中每条带 `previousStatus`：要撤销，就按 `previousStatus` 分组再调用一次。评审通过的草稿改为 `active`、下线用例改为 `deprecated`，都用这个工具。

### 删除：不可逆，先问人

- **`delete_cases`** —— 一次永久删除最多 100 条用例，这些用例必须在同一个项目中。**硬删除，没有回收站**，用例的版本历史也一起删除。只在用户明确要求删除这些用例（例如重复的用例、导入错误的用例）时调用。`id` 先从读工具拿到；不确定删除哪些用例时，先问用户。**下线正式用例库中的用例不是删除**：用 `change_case_status` 把它的 `status` 改为 `deprecated`。被测试任务用到的用例不能删除，因为测试任务不能删除，历史报告必须可以复现。工具跳过这些用例，在一个事务中删除其余的用例。不存在的 `id` 放在 `missingIds` 中，不影响其余的用例。返回 `{deleted[], skipped[], missingIds[]}`，`skipped` 中每条带 `referencedByRunCount`（用到它的测试任务数）。把跳过的用例告诉用户，并建议改为 `deprecated`。

### 事后抽查

- **`search_cases`** —— 按用例名的子串查，返回摘要行（新更新的在前）。它只回答一个问题：**这一条到底进去没有**。典型用法是导入一批之后抽查几条。

> ⚠️ `search_cases` **不返回 `steps` 与 `preconditions`**。拿它当上下文来源等于什么都没读，也**不能**用它判断一条新用例是不是和已有的重复——那两件事只有 `read_cases(detail: "full")` 做得到。

### 硬上限一览

| 工具 | 上限 |
| --- | --- |
| `read_cases` | `detail: "full"` 每页默认 10、最多 **20**；`summary` 档每页最多 100 |
| `ensure_module_path` | 路径最多 **10 段** |
| `import_test_cases` | 每批最多 **50 条**，超了整批被拒；一行最多引用 **50** 个上传凭证 |
| `create_screenshot_upload` | 每次一张图片；每个文件最多 **10 MB**，每组最多 **9** 张 |
| `change_case_status` | 每次最多 **100 条**，超了整批被拒 |
| `delete_cases` | 每次最多 **100 条**，超了整批被拒 |
| `search_cases` | 默认 20 条，上限 **50 条** |

---

## 两个 skill：看你手里是什么

这是最容易走错的岔路口，判据只看**输入的形状**：

| 你手里是 | 用哪个 skill | 它做的事 |
| --- | --- | --- |
| 需求原文、PRD、接口文档、用户故事、一段功能描述 | **`testcase-authoring`** | 从需求**设计**新用例：读平台上下文 → 拆测试点、把需求没写清的假设逐条问你 → 配测试方法 → 出草案等你确认 → 写进平台（`draft`） |
| 已经写好的用例文件：Excel / CSV / XMind / TestRail 导出件 | **`testcase-migration`** | 把存量用例**搬进**平台：解析源文件 → 字段映射方案先给你确认 → 建模块、分批导入 → 抽查并出可核对的汇总表 |

> ⚠️ 最容易用错的一处：源文件里只有用例标题、没有步骤，顺手让 agent「补全一下」——**补步骤已经是设计，不是搬运**。那时该切到 `testcase-authoring` 走它的两道确认闸门，而不是在映射流程里顺手编几步。

- 两者共用同一条写入通道和同一套字段，区别全在前半段：搬运做的是**字段映射**，设计做的是**从需求推导测试点**。
- 两个 skill 都会在动笔前先读平台，也都会在写入前停下来等你确认。**它们停下来问你不是卡住了**：需求里没写清的边界、映射有歧义的那几列，正是评审时会被推翻的部分。
- skill 正文里的工具名一律写全限定名，如 `testcase-platform:read_cases`——同一个会话里可能挂着别的 MCP server，裸名会歧义。**这里的 `testcase-platform` 是各家客户端配置里那个 server 条目名，不是 skill 名**；那个键必须逐字叫这个，否则全限定名解析不到。

---

## 一键安装

这个脚本把两个 skill 都装好，并按你本机装了哪些 agent 分别写好 MCP 配置。**它从不接收、也从不写入 token 的值。**

[下载 install-agent-skill.sh](/install-agent-skill.sh)

```bash
curl -O {{SCRIPT_URL}}
less install-agent-skill.sh
sh install-agent-skill.sh --url {{MCP_URL}} --dry-run
sh install-agent-skill.sh --url {{MCP_URL}}
```

> ⚠️ **别用 `curl … | sh`。** 这个脚本会往你的 home 和仓库根写配置文件、建符号链接，管道直灌等于在看不见内容的前提下同意这些写入。三步分开跑：先下载，再自己读一遍，`--dry-run` 会把「将要写哪些文件、写什么内容」全部打印出来但**一个字节都不写**，确认无误再去掉这个参数正式执行。

脚本装完不会替你填 token。去「API Token」那一格签一枚，然后把这一行写进 `~/.zshrc` 或 `~/.bashrc`：

```bash
export AS_TOKEN='<粘贴你的 token>'
```

只在当前 shell 里 `export` 的话，凭据会留在 shell history 里。

### 脚本的行为

- 选项：`--url`（平台 MCP 端点）、`--platform`（`claude` | `codex` | `opencode` | `zcode` | `all`）、`--scope`（`project` 写进当前目录 / `user` 写进 `$HOME`）、`--skill-only`（只装 skill，完全不碰 MCP 配置）、`--dry-run`、`-h`。
- `--url` 里不能出现引号、反斜杠、`|`、`&`——前两者会写坏 JSON，后两者会在 sed 替换时把 skill 正文悄悄改成别的东西。
- 用 `command -v` 探测本机装了哪些 agent；`--platform all`（默认）只给探测到的装，显式指定某一家时即使没探测到也照装。
- skill 真身装在 `<作用域>/.agents/skills/<skill 名>/`，**两个 skill 各一个目录**，每个都含 `SKILL.md` 与若干 `references/*.md`；另在 `<作用域>/.claude/skills/<skill 名>` 各建一个指向真身的符号链接——Claude Code 只认自己那个目录。
- skill 正文是**嵌在脚本里**的（由 `.claude/skills/` 下的真身生成），所以安装过程完全离线，不会「下到一半」或「下到旧版本」。
- 合并 JSON 优先用 `jq`，没有就用 `python3`；两个都没有时它**拒绝动手**，并把该写的内容原样打印出来让你手抄（退出码 3）。
- 改动前先备份成 `<文件>.bak.<纪元秒>`；目标 JSON 已经损坏时退出码 1 且不碰它；内容与要写的完全相同就跳过写入，所以重复跑不会堆一堆备份。
- **pi 不在写配置的名单里**——它没有 MCP 客户端，只装 skill。

---

## 各家客户端：配置互不通用

MCP 配置是**惯例不是标准**，四家的写法互不通用；抄成邻居的格式不会报错，只会**静默地连不上**。第五家 pi 没有 MCP 客户端。四家的 server 条目名都必须是 `testcase-platform`。

按你手上那个 agent，去上面那一条对应的格子里抄。

---

## Skill 与约定文件

五家吃的都是同一套 Agent Skills 约定：一个目录，里面一份 `SKILL.md`，开头是 YAML frontmatter（`name` 与 `description` 两个字段），需要展开细节时另放 `references/*.md` 让 agent 按需去读。

```markdown
---
name: testcase-authoring
description: 一句话说明这个 skill 干什么、以及什么措辞该触发它。
---

# 正文

先读什么、什么时候停下来问用户、调哪几个工具、每批多少条、错误怎么读。
```

`description` 决定 agent **什么时候想起来用它**，写触发词而不是自我介绍。两个 skill 之所以分开而不是合成一份，正是因为 agent 靠 `description` 路由：合成一份之后，两条流程里那些「必须先问用户」的闸门会被一起翻页翻过去。一键安装脚本装的就是这两份，正文已经写好。

### 装到哪个目录

- Codex / opencode / pi / zcode 都扫 `.agents/skills/`，项目级放 `<仓库根>/.agents/skills/`，用户级放 `~/.agents/skills/`。
- **Claude Code 是唯一的例外**，它只认 `.claude/skills/`。手工装的话要么在那里再放一份，要么建一个指向 `.agents/skills/` 下真身的符号链接（一键安装脚本做的就是后者）。

### 仓库约定文件

- Codex / opencode / zcode / pi 读 `AGENTS.md`。
- Claude Code 读 `CLAUDE.md`。
- pi 两个都读。
- 这两份是给仓库写规矩的地方（分支怎么开、用例导进哪个项目），与 skill **各管一段**：skill 讲「这套工具怎么用」，约定文件讲「在这个仓库里该怎么做事」。
