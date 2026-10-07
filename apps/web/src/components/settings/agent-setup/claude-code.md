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
- skill 那一侧它是**唯一的例外**：别的 agent 扫 `.agents/skills/`，它只认 `.claude/skills/`，所以安装脚本在那边额外建一个指向真身的符号链接。
