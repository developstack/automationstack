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
