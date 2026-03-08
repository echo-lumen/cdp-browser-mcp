# cdp-browser-mcp

An MCP server for browser automation that uses Chrome's native Accessibility API instead of injected JavaScript. Returns the **full page** in a single compact snapshot — **3–5x fewer tokens** than chrome-devtools-mcp and Playwright MCP.

One `cdp_navigate` call returns a compact DOM with every interactive element indexed — ready for clicking, typing, and reading.

## Why this exists

LLM-driven browser automation has a token problem. Every page snapshot eats context window. We benchmarked 5 browser tools across 8 page types:

| Tool | Median tokens | Full page? | Notes |
|---|---|---|---|
| [browser-use](https://github.com/browser-use/browser-use) (80K+ stars) | ~1,500 per viewport | Viewport only | Needs scroll calls to see full page |
| **[browser-autopilot](https://www.npmjs.com/package/browser-autopilot) / cdp-browser-mcp** | **~3,300** | **Full page** | Complete DOM in 1 call |
| [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (Google, 28K+ stars) | ~8,500 | Full page | Verbose AX tree format |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | ~17,000 | Full page | YAML ariaSnapshot format |

**browser-use** has the smallest per-viewport size because it filters to viewport-visible elements only. But when you need the full page, scrolling adds up fast. We measured the actual full-page cost by scrolling browser-use through each page and summing all viewport snapshots (approximate tokens = characters ÷ 4):

| Page | browser-use (full page) | cdp-browser-mcp (1 call) | Ratio |
|---|---|---|---|
| Wikipedia | 61,270 (19 scrolls) | **6,087** | 10x more |
| YouTube | 40,055 (4 scrolls)† | **3,338** | 12x more |
| Shoelace | 20,442 (9 scrolls) | **3,317** | 6.2x more |
| BBC News | 12,185 (7 scrolls) | **4,647** | 2.6x more |
| DataTables | 6,099 (4 scrolls) | **2,001** | 3x more |
| GitHub Issues | **592** (fits in viewport) | 3,832 | browser-use wins |
| Excalidraw | 781 (fits in viewport) | **220** | 3.5x more |
| example.com | 34 (fits in viewport) | **29** | ~same |

† YouTube has infinite scroll — we capped at 4 viewports (initial page height) for a fair comparison.

browser-use wins on pages that fit in a single viewport (GitHub Issues). For everything else — especially content-heavy or infinite-scroll pages — the full-page approach uses dramatically fewer total tokens.

**cdp-browser-mcp** gives you the full page in one call — the most token-efficient approach when you need to see or search across the entire page. Built on [browser-autopilot](https://www.npmjs.com/package/browser-autopilot), which reads Chrome's Accessibility tree via CDP and compresses it into a compact indexed format. No JavaScript injection, no DOM walking, no SVG noise.

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
heading "Example User Verified account"
[46] button "Profile Summary"
[47] button "Search"
[48] button "Following @example_user"
article "Example User @example_user Mar 6 Just published a new blog post about..."
[98] button "41 Replies. Reply"
[99] button "29 reposts. Repost"
[100] button "545 Likes. Like"
```

Use the `[N]` index with `cdp_click` or `cdp_type`. Non-interactive content (headings, articles, text) is shown for context but doesn't waste an index.

## Benchmarks

### Methodology

All benchmarks ran on the same machine (Mac Mini, Chrome 145) with all 5 tools connecting to the same Chrome instance via CDP on port 9222. Same viewport size (1,309 × 1,309px), same pages, same session.

**What the numbers measure:** Each tool returns a text representation of the page (accessibility tree, DOM snapshot, or YAML). We measure the **character count** of that output and estimate tokens as **characters ÷ 4**. This is a rough approximation — actual tokenizer counts vary by model — but the ratios between tools hold regardless of tokenizer.

**How snapshots were captured:** Navigate to URL → wait 2–3 seconds for page load → capture the tool's DOM/accessibility representation. Each tool uses its own serialization format (see [format comparison](#why-the-differences) below).

**Full-page scroll test (browser-use only):** browser-use returns only the viewport-visible portion of the page. To measure the total cost of seeing the full page, we scrolled down by one viewport height at a time, re-captured the state at each position, and summed all viewport snapshots. This is what an LLM agent using browser-use would actually consume to read the entire page. For infinite-scroll pages (YouTube), we limited scrolling to the initial page height to keep the comparison fair.

### Per-snapshot results (8 page types, 2026-03-07)

All values are approximate tokens (characters ÷ 4):

| # | Page type | browser-use (viewport) | browser-use (full page) | cdp-browser-mcp | chrome-devtools-mcp | Playwright MCP |
|---|---|---|---|---|---|---|
| 1 | Wikipedia (static article) | 2,502 | 61,270 (19 scrolls) | **6,087** | 57,288 | 55,238 |
| 2 | DataTables (data table) | 1,555 | 6,099 (4 scrolls) | **2,001** | 7,859 | 9,242 |
| 3 | Excalidraw (canvas app) | 781 | 781 | **220** | 876 | 1,622 |
| 4 | GitHub Issues (React SPA) | **592** | **592** | 3,832 | 4,647 | 17,599 |
| 5 | YouTube (iframe-heavy) | 9,166 | 40,055 (4 scrolls)† | **3,338** | 8,453 | 17,002 |
| 6 | Shoelace (web components) | 1,794 | 20,442 (9 scrolls) | **3,317** | 10,391 | 17,627 |
| 7 | example.com (minimal) | 34 | 34 | **29** | 90 | 79 |
| 8 | BBC News (news + ads) | 1,421 | 12,185 (7 scrolls) | **4,647** | 11,577 | 17,192 |

† YouTube has infinite scroll — new content lazy-loads as you scroll. We capped at 4 viewports (covering the initial 4,318px page height) for a fair comparison. Uncapped, browser-use hit 326,706 tokens across 30 scrolls without reaching the bottom.

cdp-browser-mcp is a thin MCP wrapper around [`browser-autopilot`](https://www.npmjs.com/package/browser-autopilot)'s `CDPBrowser` — they produce identical snapshots (verified by running both independently on all 8 pages). The MCP layer adds zero token overhead.

**browser-use full-page cost:** When you need to see the entire page, browser-use's per-viewport advantage disappears. Wikipedia costs 61K tokens across 19 scrolls vs 6K in a single cdp-browser-mcp call (10x). YouTube costs 40K across 4 scrolls vs 3.3K (12x). browser-use wins only on pages that fit in a single viewport (GitHub Issues: 592 vs 3,832).

**cdp-browser-mcp vs chrome-devtools-mcp:** median **3.1x fewer tokens**, range 1.2x–9.4x.

**cdp-browser-mcp vs Playwright MCP:** median **4.9x fewer tokens**, range 2.7x–9.1x.

### Why the differences?

Same Chrome instance, same pages — the differences come from how each tool serializes the page:

| Tool | What it captures | Output format |
|---|---|---|
| **[browser-use](https://github.com/browser-use/browser-use)** | Viewport-visible elements only, filtered by paint order, 100-char text cap | `[N]<tag attr=val />` — HTML-like syntax |
| **browser-autopilot / cdp-browser-mcp** | Full page accessibility tree via CDP | `[N] role "name"` — compact indexed format, text inlined |
| **chrome-devtools-mcp** | Full page accessibility tree via Puppeteer | `uid=` prefix on every node, separate `StaticText` children |
| **Playwright MCP** | Full page via Playwright's `ariaSnapshot()` | YAML with `[ref=]` tags, nested indentation |

Notes:
- Amazon blocked cdp-browser-mcp and chrome-devtools-mcp (anti-bot) but loaded for browser-use (5,368 tokens). GitHub login/dashboard differed due to auth state. Both excluded from cross-tool ratios.
- chrome-devtools-mcp has additional capabilities not tested here (performance tracing, Lighthouse audits, network inspection, device emulation).
- browser-use has additional capabilities not tested here (autonomous agent loop, CAPTCHA solving, vision mode with screenshots).

### Anti-bot detection

All 5 tools tested identically against [bot.sannysoft.com](https://bot.sannysoft.com) (30/30 pass) and Cloudflare Turnstile:

| Signal | Result (all tools) |
|---|---|
| `navigator.webdriver` | `false` |
| Chrome object present | Yes |
| Plugin count | 5 |
| Sannysoft pass rate | 30/30 |
| Cloudflare Turnstile | Challenge shown |

No stealth advantage to any tool — they all present as real Chrome. browser-use uses Playwright (which sets `navigator.webdriver = false` by default). cdp-browser-mcp and chrome-devtools-mcp attach to your existing Chrome instance via CDP.

Raw benchmark data (JSON results + sample snapshots) is available in the [`benchmarks/`](benchmarks/) directory.

## When to use other tools instead

**[browser-use](https://github.com/browser-use/browser-use)** (80K+ stars):
- You want an autonomous agent that drives the browser with an LLM loop (not just MCP tools)
- You prefer viewport-only snapshots (smaller per call, but requires scrolling)
- You need built-in CAPTCHA solving or vision-based interaction
- You're building a Python pipeline, not using Claude Code/Desktop

**[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)** (Google, 28K+ stars):
- You need performance profiling, Lighthouse audits, or memory snapshots
- You need network request inspection or device emulation
- You're debugging a web app, not automating browser tasks for an LLM agent

**[Playwright MCP](https://github.com/microsoft/playwright-mcp)**:
- Chrome on port 9222 isn't running (Playwright launches its own browser)
- You need Playwright-specific features like file upload or form fill helpers

## How it works

This server is a thin MCP wrapper around [`browser-autopilot`](https://www.npmjs.com/package/browser-autopilot)'s `CDPBrowser` class, which reads Chrome's Accessibility tree via the Chrome DevTools Protocol. The key insight: Chrome already computes a semantic accessibility tree for screen readers. Instead of injecting JavaScript to walk the DOM and guess which elements are interactive, we just read what Chrome already knows.

The result is a compact, accurate representation of the page that naturally filters out SVG paths, hidden elements, and decorative wrappers — exactly the noise that inflates other tools' token counts.

## Built on browser-autopilot

[`browser-autopilot`](https://www.npmjs.com/package/browser-autopilot) is the underlying engine by [@eigengajesh](https://github.com/eigengajesh). It's a full autonomous browser agent framework that goes well beyond what this MCP server exposes:

| Capability | cdp-browser-mcp | browser-autopilot |
|---|---|---|
| CDP browser control | 17 MCP tools | Full CDPBrowser class + 25+ agent tools |
| Compact AX tree snapshots | Yes (the whole point) | Yes (this is where it comes from) |
| Autonomous agent loop | No (you're the agent) | Yes — multi-step LLM-driven via Vercel AI SDK |
| X11 fallback (Linux) | No | Yes — real mouse/keyboard when CDP gets blocked |
| Login orchestration | No | Yes — cached sessions, CDP login, X11 fallback |
| CAPTCHA solving | No | Yes — Capsolver, 2Captcha integration |
| File upload/paste | No | Yes — `upload_file`, `paste_content`, `paste_image` |
| Docker/cloud deployment | No | Yes — Xvfb, noVNC, containerized |

If you need the MCP interface for Claude Code / Claude Desktop / Cursor — use this server. If you need the full autonomous agent framework for headless pipelines or authenticated workflows — use `browser-autopilot` directly.

```bash
npm install browser-autopilot ai zod
```

```ts
import { CDPBrowser, runAgent } from "browser-autopilot";

const browser = new CDPBrowser();
await browser.connect();

const { result, success } = await runAgent({
  browser,
  task: "Go to wikipedia.org and find the population of Tokyo.",
});
```

## License

MIT
