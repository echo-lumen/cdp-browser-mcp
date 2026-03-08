# cdp-browser-mcp

An MCP server for browser automation that uses Chrome's native Accessibility API instead of injected JavaScript. **3–5x fewer tokens** than chrome-devtools-mcp and Playwright MCP per page snapshot.

One `cdp_navigate` call returns a compact DOM with every interactive element indexed — ready for clicking, typing, and reading.

## Why this exists

LLM-driven browser automation has a token problem. Every page snapshot eats context window. We benchmarked 3 popular browser MCP tools across 8 page types and found:

| Tool | Median tokens | vs cdp-browser-mcp |
|---|---|---|
| **cdp-browser-mcp** | **~3,300** | — |
| [chrome-devtools-mcp](https://github.com/nichochar/chrome-devtools-mcp) (Google) | ~8,500 | 3.1x more |
| [Playwright MCP](https://github.com/nichochar/playwright-mcp) | ~17,000 | 4.9x more |

The difference: cdp-browser-mcp reads Chrome's built-in Accessibility tree via CDP and compresses it into a compact indexed format. No JavaScript injection, no DOM walking, no SVG noise, no redundant `StaticText` nodes. Just the semantic structure the browser already computed.

## Quick start

### 1. Install

```bash
git clone https://github.com/echo-lumen/cdp-browser-mcp.git
cd cdp-browser-mcp
npm install
```

### 2. Start Chrome with CDP enabled

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-profile \
  --no-first-run --no-default-browser-check "about:blank" &
```

On Linux:
```bash
google-chrome --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-profile \
  --no-first-run --no-default-browser-check "about:blank" &
```

### 3. Add to your MCP config

**Claude Code** (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "cdp-browser": {
      "command": "node",
      "args": ["/path/to/cdp-browser-mcp/server.mjs"],
      "env": {
        "CDP_URL": "http://127.0.0.1:9222"
      }
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "cdp-browser": {
      "command": "node",
      "args": ["/path/to/cdp-browser-mcp/server.mjs"],
      "env": {
        "CDP_URL": "http://127.0.0.1:9222"
      }
    }
  }
}
```

## Tools (17)

### Navigation
| Tool | Description |
|---|---|
| `cdp_navigate` | Go to a URL. Returns DOM snapshot. |
| `cdp_go_back` | Navigate back. Returns DOM snapshot. |
| `cdp_reload` | Reload page. Returns DOM snapshot. |

### Reading page state
| Tool | Description |
|---|---|
| `cdp_snapshot` | Get the current indexed DOM. |
| `cdp_screenshot` | Take a screenshot (PNG or JPEG). |
| `cdp_page_text` | Get `document.body.innerText`. Fills gaps where the accessibility tree misses prose/bio text. |

### Interaction
| Tool | Description |
|---|---|
| `cdp_click` | Click element by `[N]` index. |
| `cdp_type` | Type into element by `[N]` index. Per-character key events (works with React/Vue). |
| `cdp_press_key` | Press a keyboard key (Enter, Escape, Tab, etc.). |
| `cdp_scroll` | Scroll up or down. |
| `cdp_click_at` | Click at x,y coordinates. |

### Tabs
| Tool | Description |
|---|---|
| `cdp_tabs` | List, open, switch, or close tabs. |

### Advanced
| Tool | Description |
|---|---|
| `cdp_evaluate` | Execute arbitrary JavaScript. |
| `cdp_handle_dialog` | Accept or dismiss alerts/confirms/prompts. |
| `cdp_wait` | Wait N seconds. |
| `cdp_wait_for_url` | Wait until URL contains a substring. |
| `cdp_element_html` | Get the HTML of an element by index. |

## How the DOM snapshot works

Every mutation tool auto-returns the updated DOM. Interactive elements are indexed:

```
heading "Simon Willison Verified account"
[46] button "Profile Summary"
[47] button "Search"
[48] button "Following @simonw"
article "Simon Willison @simonw Mar 6 Qwen3.5 4B apparently out-scores GPT-4o..."
[98] button "41 Replies. Reply"
[99] button "29 reposts. Repost"
[100] button "545 Likes. Like"
```

Use the `[N]` index with `cdp_click` or `cdp_type`. Non-interactive content (headings, articles, text) is shown for context but doesn't waste an index.

## Benchmarks

### Multi-page benchmark (8 page types, 2026-03-07)

Tested across diverse page types — static content, SPAs, canvas apps, web components, news sites:

| # | Page type | cdp-browser-mcp | chrome-devtools-mcp | Playwright MCP |
|---|---|---|---|---|
| 1 | Wikipedia (static article) | **6,087** | 57,288 | 55,238 |
| 2 | DataTables (data table) | **2,001** | 7,859 | 9,242 |
| 3 | Excalidraw (canvas app) | **220** | 876 | 1,622 |
| 4 | GitHub Issues (React SPA) | **3,832** | 4,647 | 17,599 |
| 5 | YouTube (iframe-heavy) | **3,338** | 8,453 | 17,002 |
| 6 | Shoelace (web components) | **3,317** | 10,391 | 17,627 |
| 7 | example.com (minimal) | **29** | 90 | 79 |
| 8 | BBC News (news + ads) | **4,647** | 11,577 | 17,192 |

All values are approximate token counts (chars/4).

**cdp-browser-mcp vs chrome-devtools-mcp (Google):** median 3.1x fewer tokens, range 1.2x–9.4x.
**cdp-browser-mcp vs Playwright MCP:** median 4.9x fewer tokens, range 2.7x–9.1x.

Why the difference? chrome-devtools-mcp uses Puppeteer's accessibility tree, which includes `uid=` prefixes on every node and separate `StaticText` children for every piece of text. Playwright MCP uses a YAML-formatted `ariaSnapshot()` with `[ref=]` tags. cdp-browser-mcp reads the same Chrome AX tree but compresses it — inlining text, stripping metadata, and indexing only interactive elements.

Notes:
- Amazon blocked all three tools equally (anti-bot). GitHub login/dashboard differed due to auth state. Both excluded from ratios.
- chrome-devtools-mcp has additional capabilities not tested here (performance tracing, Lighthouse audits, network inspection, device emulation) — it's a broader tool aimed at web development debugging.
- CDP's token advantage is largest on content-heavy pages (Wikipedia 9.4x vs Google, 9.1x vs Playwright) and smallest on already-compact pages.

### Single-page deep comparison (x.com/simonw)

| Metric | cdp-browser-mcp | Playwright MCP | Ratio |
|---|---|---|---|
| DOM snapshot size | ~10,700 chars | 58,800 chars | **5.5x smaller** |
| Approximate tokens | ~2,700 | ~14,700 | **5.5x fewer** |
| Elements indexed | 177 | ~200 | Similar |
| Tool calls needed | 1 | 2–3 | Fewer |
| Bio text | via `cdp_page_text` | In snapshot | +1 call |
| Tweet text | Yes | Yes | Same |
| Engagement metrics | Yes | Yes | Same |
| Follower count | Yes | Yes | Same |

### Anti-bot detection

All tools tested identically against bot.sannysoft.com (30/30 pass) and Cloudflare Turnstile:

| Signal | cdp-browser-mcp | Playwright MCP |
|---|---|---|
| `navigator.webdriver` | `false` | `false` |
| Chrome object present | Yes | Yes |
| Plugin count | 5 | 5 |
| Sannysoft pass rate | 30/30 | 30/30 |
| Cloudflare Turnstile | Challenge shown | Challenge shown |

No detection advantage to any tool — they all present as real Chrome.

## When to use other tools instead

**[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)** (Google, 28K+ stars):
- You need performance profiling, Lighthouse audits, or memory snapshots
- You need network request inspection
- You want device emulation
- You're debugging a web app, not automating browser tasks for an LLM agent

**[Playwright MCP](https://github.com/nichochar/playwright-mcp)**:
- Chrome on port 9222 isn't running (Playwright launches its own browser)
- You need bio/prose text natively in the accessibility snapshot (without a second `cdp_page_text` call)
- You need Playwright-specific features like file upload or form fill helpers

## How it works

This server wraps [`browser-autopilot`](https://www.npmjs.com/package/browser-autopilot)'s `CDPBrowser` class, which reads Chrome's Accessibility tree via the Chrome DevTools Protocol. The key insight: Chrome already computes a semantic accessibility tree for screen readers. Instead of injecting JavaScript to walk the DOM and guess which elements are interactive, we just read what Chrome already knows.

The result is a compact, accurate representation of the page that naturally filters out SVG paths, hidden elements, and decorative wrappers — exactly the noise that inflates other tools' token counts.

## License

MIT
