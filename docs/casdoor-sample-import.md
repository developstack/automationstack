# Casdoor 样板数据的导入

本文说明怎样把两个样板 XLSX 文件导入 Casdoor 4.11.0。导入后，Casdoor 中有 3 个样板用户和 2 个角色。运维人员用这些用户检查平台的三个平台角色。

- 领域术语见仓库根目录的 `CONTEXT.md`。
- 需求见 GitHub issue #17 和它的上级 issue #10。
- 组织和应用的设置见 `plans/021-builtin-admin-and-casdoor-auth-switch.md` 第 11 节和 T17。

## 1. 样板文件

| 文件 | 内容 |
| --- | --- |
| `casdoor-automationstack-users.xlsx`（下文称「用户文件」） | 组织 `automationstack` 中的 3 个用户 |
| `casdoor-automationstack-roles.xlsx`（下文称「角色文件」） | 2 个角色和它们的成员 |

- 仓库中没有这两个文件，也没有生成它们的脚本。向 issue #17 的实现者索取这两个文件。
- 用户文件的 `password` 列中有每个用户的明文密码。这些密码是样板数据，导入后必须修改（第 6 节）。

### 1.1 用户文件

列名：`owner`、`name`、`display_name`、`password`、`type`、`signup_application`。

| `name`（用户名） | `display_name`（显示名） | 平台角色 |
| --- | --- | --- |
| `platform-admin` | 平台管理员 | 平台管理员 |
| `project-admin` | 项目管理员 | 项目管理员 |
| `normal-user` | 普通用户 | 普通用户 |

每一行的 `owner` 是 `automationstack`，`type` 是 `normal-user`，`signup_application` 是 `automationstack`。

### 1.2 角色文件

列名：`owner`、`name`、`display_name`、`description`、`users`、`groups`、`roles`、`domains`、`is_enabled`。

| `name`（角色名） | `users`（成员） | `is_enabled` |
| --- | --- | --- |
| `automationstack-admin` | `["automationstack/platform-admin"]` | `1` |
| `automationstack-project-admin` | `["automationstack/project-admin"]` | `1` |

每一行的 `owner` 是 `automationstack`。`groups`、`roles` 和 `domains` 是 `[]`。

### 1.3 列名的来源

Casdoor 4.11.0 的源码决定列名。不要使用 Casdoor 控制台的「下载模板」，也不要使用 Casdoor 源码中的样例 XLSX 文件。

- `object/user_upload.go` 和 `object/role_upload.go`：Casdoor 读取第一个工作表，第一行是列名。列名中有 `#` 时，Casdoor 只使用 `#` 后面的部分。
- `object/user_util.go` 的 `StringArrayToStruct`：Casdoor 删除列名中的 `_`，然后不区分大小写地与 `User` 或 `Role` 的字段名比较。Casdoor 忽略不能匹配的列。
- 布尔列：只有文本 `1` 表示「是」。
- 列表列（例如 `users`）：值是 JSON 数组。角色成员的格式是 `组织/用户名`。

## 2. 前提

- Casdoor 的版本是 4.11.0。在本地，用 `make casdoor-up` 启动 Casdoor，地址是 `http://localhost:8100`。
- 用 Casdoor 全局管理员（`built-in` 组织中的管理员）登录 Casdoor 控制台。本地 Casdoor 的默认全局管理员是 `admin`。
- Casdoor 中没有角色 `automationstack-admin` 和 `automationstack-project-admin`。原因见第 6.4 节。
- 不要在导入前运行 `make casdoor-bootstrap`。这个命令创建角色 `automationstack-admin`，角色文件的上传会失败。

## 3. 步骤 1：创建组织和应用

按 plan 021 第 11 节的环境手工创建组织和应用。T17 第 1、2 步说明每个设置的原因。不要执行 T17 第 3 步：角色文件创建角色。

1. 打开「用户管理 → 组织」，创建组织 `automationstack`。
2. 把组织的密码类型（`passwordType`）设为 `bcrypt`。
3. 打开「身份认证 → 应用」，创建应用 `automationstack`。
4. 把应用的组织设为 `automationstack`，关闭「Is shared」。
5. 关闭「启用注册」和「启用访客登录」。
6. 在「OAuth授权类型」中只选择 `authorization_code` 和 `client_credentials`。
7. 把 Token 格式设为 `JWT`。
8. 在「重定向URLs」中加入平台的回调地址。
9. 回到组织 `automationstack`，把默认应用（`defaultApplication`）设为 `automationstack`。

回调地址：

| 环境 | 地址 |
| --- | --- |
| 本地 | `http://localhost:3000/api/auth/casdoor/callback` |
| 生产 | `https://testcase.trendf.top/api/auth/casdoor/callback` |

## 4. 步骤 2：上传用户文件

1. 打开「用户管理 → 用户」。
2. 点击「上传 (.xlsx)」。
3. 选择用户文件。
4. 在预览对话框中点击「点击上传」。

预览对话框只显示「下载模板」中的列名。用户文件使用源码中的列名，所以预览的单元格可以是空的。这不是错误。

预期结果：组织 `automationstack` 中有 3 个用户：`platform-admin`、`project-admin` 和 `normal-user`。

## 5. 步骤 3：上传角色文件

用户文件必须先上传。Casdoor 不检查角色成员是否存在。

1. 打开「Casbin权限管理 → 角色」。
2. 点击「上传 (.xlsx)」。
3. 选择角色文件。
4. 在预览对话框中点击「点击上传」。

预期结果：

| 角色 | 组织 | 成员 | 状态 |
| --- | --- | --- | --- |
| `automationstack-admin` | `automationstack` | `automationstack/platform-admin` | 已启用 |
| `automationstack-project-admin` | `automationstack` | `automationstack/project-admin` | 已启用 |

## 6. 注意事项

### 6.1 密码

- 用户文件中的密码是样板数据。任何人得到这个文件，就知道这些密码。
- 导入后，在 Casdoor 控制台中修改每个用户的密码。生产环境中，在用户第一次登录前修改密码。
- Casdoor 用明文保存上传的密码（`passwordType` 是 `plain`）。用户第一次登录成功时，Casdoor 用组织的密码类型重新计算密码散列。源码见 `object/check.go` 的 `CheckPassword`。
- 不要把用户文件或密码保存到仓库中。

### 6.2 角色名

- 角色名必须与平台认证设置页中的「平台管理员角色名」和「项目管理员角色名」相同。
- 「平台管理员角色名」没有默认值。把它设为 `automationstack-admin`，与角色文件一致。
- 「项目管理员角色名」的默认值是 `automationstack-project-admin`，与角色文件一致。
- 认证设置使用其他角色名时，上传前修改角色文件的 `name` 列。
- 平台只计算组织与认证设置一致的、已启用的角色。

### 6.3 修改文件

- 不要删除 `owner` 列。全局管理员上传用户文件时，Casdoor 把第一行的 `owner` 用作组织。`owner` 是空的时，用户进入 `built-in` 组织。
- `is_enabled` 必须是文本 `1`。Excel 中的布尔值 `TRUE` 使上传的角色禁用。
- `users` 必须是 JSON 数组，例如 `["automationstack/platform-admin"]`。

### 6.4 再次上传

- 用户文件：Casdoor 跳过已经存在的用户。所有用户都存在时，上传失败，Casdoor 显示「The users already exist」。
- 角色文件：角色存在时，不要再次上传。Casdoor 只在上传人的组织中查找已有的角色。全局管理员属于 `built-in`，所以 Casdoor 找不到已有的角色。数据库拒绝重复的角色，上传失败。
- 角色文件不能修改已有角色的成员。在角色的编辑页中手工增加成员。

## 7. 检查平台角色

1. 在平台的认证设置页中，确认「组织」是 `automationstack`。
2. 确认「平台管理员角色名」和「项目管理员角色名」与角色文件一致。
3. 用 `platform-admin` 登录平台，确认平台角色是平台管理员。
4. 用 `project-admin` 登录平台，确认平台角色是项目管理员。
5. 用 `normal-user` 登录平台，确认平台角色是普通用户。
