# dsh 测试用例平台插件

本插件把 dsh 连接到测试用例平台。安装后，dsh 能在平台中设计、导入和管理测试用例。

## 术语

本文中的每个术语只有一个含义。

| 术语 | 含义 |
| --- | --- |
| dsh | DeepSeek Harness 的命令行程序。 |
| profile | `$DSH_HOME/profiles/<名称>` 下的一个目录。profile 记录一组插件和这些插件的配置。 |
| `$DSH_HOME` | dsh 的主目录。默认值是 `~/.dsh`。 |
| API token | 平台为一个用户生成的凭据，以 `as_` 开头。 |
| MCP 端点 | 平台的 MCP 地址。默认值是 `https://testcases.logwing.com/mcp`。 |
| 工具 | MCP 端点提供的一个操作，例如 `list_projects`。 |
| skill | 一个目录，包含 `SKILL.md` 和 `references/*.md`。skill 告诉模型完成一类任务的步骤。 |
| 插件行 | `cordis.patch.yml` 中 `id: testcase-platform` 的那一行配置。 |

## 插件提供的内容

### 工具

插件连接 MCP 端点，传输方式是 Streamable HTTP。dsh 用 `mcp__testcase-platform__<工具>` 的名称显示每个工具。

| 工具 | 用途 |
| --- | --- |
| `list_projects` | 列出 API token 用户可见的项目。 |
| `create_project` | 新建一个项目。 |
| `get_module_tree` | 读取模块树和每个模块的用例数。 |
| `ensure_module_path` | 按路径找到模块。路径中不存在的模块，工具会新建。 |
| `read_cases` | 读取用例，可按模块、关键字、状态等条件过滤。 |
| `list_case_tags` | 列出项目中的全部标签。 |
| `search_cases` | 按关键字搜索用例。 |
| `import_test_cases` | 一次写入 1 到 50 条用例。 |
| `change_case_status` | 修改用例的状态：草稿、有效或废弃。 |
| `delete_cases` | 删除用例。删除操作不能撤销。 |
| `create_screenshot_upload` | 为一条用例的截图取得上传地址。 |
| `void_test_run` | 作废一个测试任务。 |

工具的权限等于 API token 用户的权限。平台没有默认身份。

### skill

| skill | 用途 |
| --- | --- |
| `testcase-authoring` | 从需求设计测试用例，然后写入平台。新用例的状态是草稿。 |
| `testcase-migration` | 把 Excel、CSV、XMind 或 TestRail 中的用例导入平台。 |

插件只读取包内的 `skills/` 目录。插件不扫描 dsh 的默认 skill 目录。

## 前提条件

- dsh 的版本必须在 0.2.x 范围内。`package.json` 中的 `engines.dsh` 是 `>=0.2.0-0 <0.3.0-0`。作者用 dsh 0.2.2-rc.1 检查了本文的安装和配置步骤。
- Node.js 的版本必须是 24.9.0 或更高。dsh 需要这个版本。
- `PATH` 中必须有 pnpm。`dsh plugin` 命令调用 pnpm。
- 你必须有平台账号。你还必须是目标项目的成员。

## 创建 API token

1. 登录平台。
2. 打开一个项目。
3. 在侧栏中点击「设置」。
4. 点击「API Token」标签页。
5. 点击「新建 Token」。
6. 在「备注名」中输入一个名称，例如 `dsh`。
7. 点击「创建」。
8. 复制对话框中的 token。

平台只显示一次 token 的明文。关闭对话框后，你不能再看到它。如果你丢失 token，吊销它，然后新建一个。

API token 属于你本人，不属于项目。

## 安装

以下步骤中的 `<p>` 是 profile 的名称，例如 `web` 或 `headless`。第一次使用一个 profile 时，dsh 自动创建它。

### 从本地目录安装

1. 克隆本仓库。
2. 运行以下命令：

   ```sh
   dsh plugin --profile <p> add <仓库路径>/plugins/dsh-testcase-platform
   ```

pnpm 以 `link:` 方式记录这个目录。profile 直接使用仓库中的文件。不要移动或删除这个目录。

### 从 .tgz 文件安装

1. 打包插件：

   ```sh
   cd <仓库路径>/plugins/dsh-testcase-platform
   pnpm pack --pack-destination <输出目录>
   ```

2. 把 `<输出目录>/automationstack-dsh-testcase-platform-0.1.0.tgz` 发给用户。
3. 用户运行以下命令：

   ```sh
   dsh plugin --profile <p> add <路径>/automationstack-dsh-testcase-platform-0.1.0.tgz
   ```

pnpm 显示 `Issues with peer dependencies found` 时，不需要处理。dsh 用自己安装的副本提供这些依赖。

### 卸载

```sh
dsh plugin --profile <p> remove @automationstack/dsh-testcase-platform
```

## 配置 MCP 端点和 API token

插件行接受两个配置键：

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `url` | `https://testcases.logwing.com/mcp` | MCP 端点。只接受 `http` 和 `https`。 |
| `tokenEnv` | `AS_TOKEN` | 存放 API token 的环境变量的名称。 |

API token 不是配置键。不要把 API token 写入 `cordis.patch.yml`。

### 设置 API token

1. 在启动 dsh 的 shell 中设置环境变量：

   ```sh
   export AS_TOKEN=as_xxxxxxxx
   ```

2. 启动 dsh。

dsh 也把 `<启动目录>/.env` 和 `$DSH_HOME/.env` 中的变量读入环境。你可以把 API token 写在 `$DSH_HOME/.env` 中。不要把含有 API token 的 `.env` 提交到版本库。

插件在启动时读取 API token。修改 API token 后，必须重启 dsh。

### 修改 MCP 端点

1. 打开 `$DSH_HOME/profiles/<p>/cordis.patch.yml`。
2. 加入以下内容：

   ```yaml
   - id: testcase-platform
     config:
       url: https://cases.example.com/mcp
       tokenEnv: AS_TOKEN
   ```

3. 重启 dsh。

dsh 用新的 `config` 替换整个旧的 `config`，不做合并。因此，你必须写出需要的每个键。

如需只对一次启动生效，把同样的内容写入一个文件，然后在 `dsh` 后加 `--patch <文件>`。`--patch` 必须写在 `--no-open` 等应用参数之前。

### 配置错误时的行为

| 情况 | 插件的行为 |
| --- | --- |
| 环境变量没有值 | 插件发出警告。插件仍然连接 MCP 端点，但请求中没有 `Authorization` 头。平台返回 401，dsh 中没有平台工具。 |
| `url` 不是合法的 `http` 或 `https` 地址 | 插件记录错误，不连接 MCP 端点。两个 skill 仍然可用。 |
| `url` 使用 `http`，主机不是本机 | 插件发出警告：API token 以明文发送。 |
| `tokenEnv` 不是合法的变量名 | 插件记录错误，不连接 MCP 端点。 |
| 配置中有未知的键 | 插件发出警告，忽略这个键。 |

插件把警告和错误写入 dsh 的日志。连接失败时，dsh 照常启动。

## 检查安装

1. 显示组合后的配置：

   ```sh
   dsh --profile <p> --dump-config
   ```

2. 在输出中找到 `# == @automationstack/dsh-testcase-platform`。这一行下面必须有插件行。
3. 如果你修改了 MCP 端点，确认插件行中的 `config` 是你的值。
4. 设置 API token 和 DeepSeek API key，然后运行一个任务：

   ```sh
   dsh plugin --profile headless add <仓库路径>/plugins/dsh-testcase-platform
   dsh headless "调用 mcp__testcase-platform__list_projects，列出我可见的项目"
   ```

5. 确认结果中有你的项目。

## 更新内置的 skill

`skills/` 目录是 `.claude/skills/` 的副本。不要直接修改 `skills/` 中的文件。

1. 用 dev-cli 同步 `.claude/skills/`。
2. 在仓库根目录运行生成器：

   ```sh
   node scripts/build-dsh-plugin-skills.js
   ```

3. 检查副本：

   ```sh
   node scripts/build-dsh-plugin-skills.js --check
   ```

4. 提交 `skills/` 的变化。

生成器复制每个 skill 的 `SKILL.md` 和 `references/*.md`。生成器删除 `skills/` 中多余的文件。

生成器只做一处替换：把 `http://localhost:3000/mcp` 换成插件的默认 MCP 端点。dsh 直接读取 skill 文件，没有替换步骤。因此副本中不能保留占位符。

找不到 `.claude/skills/` 时，`--check` 打印提示并以 0 退出。CI 中没有这个目录，所以 CI 跳过这项检查。

## 故障排除

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| dsh 中没有 `mcp__testcase-platform__*` 工具 | 环境变量没有值，或 API token 无效。平台返回 401 时不注册工具。 | 检查环境变量，然后重启 dsh。必要时新建 API token。 |
| dsh 中没有 `mcp__testcase-platform__*` 工具 | `url` 错误，或平台不可达。 | 用 `--dump-config` 检查 `url`。确认网络能访问 MCP 端点。 |
| `dsh plugin add` 拒绝安装，提示 `engines.dsh` | dsh 的版本不在 0.2.x 范围内。 | 安装 0.2.x 的 dsh。 |
| `dsh: pnpm was not found` | `PATH` 中没有 pnpm。 | 安装 pnpm，或运行 `corepack enable`。 |
| 工具返回 `Error: 你不是该项目的成员` | API token 用户不是项目成员。 | 请项目 owner 把你加入项目。不要改用其他项目。 |
| skill 提到 `.mcp.json` 或 Claude Code 的 `/mcp` | skill 原本为 Claude Code 编写。 | 忽略这些步骤。在 dsh 中按本文配置。 |

## 限制

- dsh 是开发者预览版。dsh 以后会有不兼容的变更。新的 dsh 版本发布后，必须重新检查本插件。
- dsh 的 MCP 客户端不支持 OAuth。插件只用 `Authorization: Bearer` 头传递 API token。
- `peerDependencies` 固定为 0.2.2-rc.1，因为本仓库要求精确版本。dsh 只用 `engines.dsh` 判断兼容性。
- skill 的正文为 Claude Code 编写。部分排查步骤在 dsh 中不适用，见「故障排除」。

### 未确认的事项

- `${credential:REF}` 凭据模板：`@deepseek-ai/dsh-mcp-client` 0.2.2-rc.1 的配置中没有 `expandTemplates` 字段。插件不支持这种写法。
- 插件的警告和错误显示在 dsh 的哪个界面：本文没有确认。dsh 不把这些日志写到终端。
- 第 4 步的 headless 任务：本文的作者没有运行它，因为它需要 DeepSeek API key。
- Web UI 中工具列表和 skill 列表的显示：本文没有逐项检查。
- `.env` 文件中的 API token：dsh 的文档说明 dsh 把 `.env` 读入环境。本文没有测试这一点。
- dsh 0.2.2-rc.1 以外的 0.2.x 版本：本文没有测试。
