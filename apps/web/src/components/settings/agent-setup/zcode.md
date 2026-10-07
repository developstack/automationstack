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
