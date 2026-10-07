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
