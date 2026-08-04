# @pipeworx/alienvault-otx

AlienVault OTX MCP — community threat-intelligence pulses + indicator lookups.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_pulses(query, limit?, page?)`
- `get_pulse(pulse_id)`
- `lookup_indicator(indicator, type?)` — IPv4 / IPv6 / domain / hostname / url / file

## Auth

- **Platform key:** gateway env `PLATFORM_OTX_KEY`.
- **BYO:** `?_apiKey=<key>` after registering free at https://otx.alienvault.com.

## Data source

`https://otx.alienvault.com/api/v1` — header `X-OTX-API-KEY`.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "alienvault-otx": {
      "url": "https://gateway.pipeworx.io/alienvault-otx/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Alienvault Otx data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
