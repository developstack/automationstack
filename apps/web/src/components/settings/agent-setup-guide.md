## 先接上这三步

1. **签一枚 token**——上面「API Token」那一格，`as_` 开头。
2. **跑一次安装脚本**——它装两个 skill，并按你本机装了哪些 agent 分别写好 MCP 配置。
3. **`export AS_TOKEN=…` 之后重启 agent**，让它调一次 `list_projects`：能列出项目就算接上了。

> 前两步是**一次性配置**，装完不必再回来。日常真正在用的只有下面这条端点和八个工具——其中最要紧的一条是：**动笔写用例之前先调 `read_cases` 把平台上已有的用例正文读进来**，理由见「动笔之前」那一节。

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

## 八个工具

按「你什么时候会用到它」分四组，不是八件等权重的事。

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

### 事后抽查

- **`search_cases`** —— 按用例名的子串查，返回摘要行（新更新的在前）。它只回答一个问题：**这一条到底进去没有**。典型用法是导入一批之后抽查几条。

> ⚠️ `search_cases` **不返回 `steps` 与 `preconditions`**。拿它当上下文来源等于什么都没读，也**不能**用它判断一条新用例是不是和已有的重复——那两件事只有 `read_cases(detail: "full")` 做得到。

### 硬上限一览

| 工具 | 上限 |
| --- | --- |
| `read_cases` | `detail: "full"` 每页默认 10、最多 **20**；`summary` 档每页最多 100 |
| `ensure_module_path` | 路径最多 **10 段** |
| `import_test_cases` | 每批最多 **50 条**，超了整批被拒 |
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
- skill 正文里的工具名一律写全限定名，如 `testcase-platform:read_cases`——同一个会话里可能挂着别的 MCP server，裸名会歧义。**这里的 `testcase-platform` 是下面各家配置里那个 server 条目名，不是 skill 名**；那个键必须逐字叫这个，否则全限定名解析不到。

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

## 接进各家客户端

MCP 配置是**惯例不是标准**，四家的写法互不通用；抄成邻居的格式不会报错，只会**静默地连不上**。第五家 pi 没有 MCP 客户端。四家的 server 条目名都必须是 `testcase-platform`。

### Claude Code

- **项目级**：`<仓库根>/.mcp.json`
- **用户级**：`~/.claude.json`

```json
{
  "mcpServers": {
    "testcase-platform": {
      "type": "http",
      "url": "{{MCP_URL}}",
      "headers": {
        "Authorization": "Bearer ${AS_TOKEN}"
      }
    }
  }
}
```

- 支持 `${VAR}` 与 `${VAR:-默认值}` 插值，所以配置里留占位符即可，不必写死 token。
- 用户级的 `~/.claude.json` 同时装着会话历史等一堆结构，建议用官方命令改它：`claude mcp add --scope user --transport http`（注意给 header 加单引号，否则 shell 会先把占位符吃掉）。

### Codex

- **项目级**：`<仓库根>/.codex/config.toml`
- **用户级**：`~/.codex/config.toml`

```toml
[mcp_servers.testcase-platform]
url = "{{MCP_URL}}"
bearer_token_env_var = "AS_TOKEN"
```

- **不要写 `type` 字段**——Codex 的远程 server 没有这一项。
- 不支持任何字符串插值，只接受「环境变量的名字」：`bearer_token_env_var` 填 `AS_TOKEN` 这个名字本身，**不是它的值**。要加别的头就用 `env_http_headers`，它的值同样是变量名，变量内容被整体当作头的值取用。
- 项目级的 `.codex/config.toml` 要求该项目已被 trust，否则 Codex 根本不读它。

### opencode

- **项目级**：`<仓库根>/opencode.json`
- **用户级**：`~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "testcase-platform": {
      "type": "remote",
      "url": "{{MCP_URL}}",
      "enabled": true,
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {env:AS_TOKEN}"
      }
    }
  }
}
```

- 三处与众不同：顶层键是 `mcp`（不是 `mcpServers`）、`type` 是 `remote`（不是 `http`）、还必须显式写 `enabled`。
- **`"oauth": false` 必须写。** 漏了它 opencode 会自己去试 OAuth 握手，而这个端点只认 Bearer。
- 插值语法是 `{env:AS_TOKEN}`（另支持 `{file:路径}`），不是 `${...}`。

### zcode

- **项目级**：`<仓库根>/.agents/mcp.json`
- **用户级**：`~/.agents/mcp.json`

```json
{
  "mcpServers": {
    "testcase-platform": {
      "type": "http",
      "url": "{{MCP_URL}}",
      "headers": {
        "Authorization": "Bearer <把这里换成你的 token>"
      }
    }
  }
}
```

> ⚠️ 上面这份正文里的 HTTP 字段名（`type` / `url` / `headers`）**不是官方文档写明的**，是照「`.agents/mcp.json` 采用与 Claude Code 相同的结构」推断出来的。zcode 官方只给了 stdio 的示例。如果它不认，改走图形界面：Settings → MCP Servers → New MCP Server，填端点地址加一个 `Authorization: Bearer` 头。

> ⚠️ 同一作用域下只要 `.zcode` 的配置里声明了任何一个 MCP server，`.agents/mcp.json` 就会被**整份忽略、不做合并**。两边都配了以 `.zcode` 为准。

- 没有确认可用的插值语法，所以上面写的是字面量占位符，需要你手工替换成真 token。换完请确认这个文件**没有被提交进 git**——它会含明文凭据。

### pi

- 没有 MCP 配置文件要写，只装 skill；它会直接扫 `.agents/skills/`，符号链接都不需要。
- **pi 不支持 MCP**：它的 README 逐字写着 “No MCP”。别给它配 MCP，配了也不会生效。要在 pi 上用这个端点，得自己按标准 JSON-RPC over HTTP（`tools/list` / `tools/call`）直连。
- 想让它认全局的 `~/.agents/skills`，在 `~/.pi/agent/settings.json` 里加 `{ "skills": ["~/.agents/skills"] }`——脚本不替你改这个文件。

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
