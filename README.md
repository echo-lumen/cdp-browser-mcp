# cdp-browser-mcp

An MCP server for browser automation that uses Chrome's native Accessibility API instead of injected JavaScript. Returns the **full page** in a single compact snapshot — **3.3x fewer tokens** than chrome-devtools-mcp and **4.6x fewer** than Playwright MCP.

One `cdp_navigate` call returns a compact DOM with every interactive element indexed — ready for clicking, typing, and reading.

## Why this exists

LLM-driven browser automation has a token problem. Every page snapshot eats context window. We benchmarked 5 browser tools across 8 page types:

| Tool | Median tokens | Full page? | Notes |
|---|---|---|---|
| [browser-use](https://github.com/browser-use/browser-use) (80K+ stars) | ~2,000 per viewport | Viewport only | Needs scroll calls to see full page |
| **[browser-autopilot](https://www.npmjs.com/package/browser-autopilot) / cdp-browser-mcp** | **~3,800** | **Full page** | Complete DOM in 1 call |
| [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (Google, 28K+ stars) | ~10,900 | Full page | Verbose AX tree format |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | ~17,400 | Full page | YAML ariaSnapshot format |

**browser-use** has the smallest per-viewport size because it filters to viewport-visible elements only. But when you need the full page, scrolling adds up fast. We measured the actual full-page cost by scrolling browser-use through each page and summing all viewport snapshots:

| Page | browser-use (full page) | cdp-browser-mcp (1 call) | Ratio |
|---|---|---|---|
| Wikipedia | 66,067 (19 scrolls) | **7,092** | 9.3x more |
| YouTube | 50,544 (4 scrolls)† | **3,961** | 12.8x more |
| Shoelace | 26,295 (9 scrolls) | **3,705** | 7.1x more |
| BBC News | 15,624 (7 scrolls) | **4,288** | 3.6x more |
| DataTables | 8,874 (4 scrolls) | **2,332** | 3.8x more |
| GitHub Issues | **874** (fits in viewport) | 4,006 | browser-use wins |
| Excalidraw | 986 (fits in viewport) | **282** | 3.5x more |
| example.com | 28 (fits in viewport) | **31** | ~same |

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

**What the numbers measure:** Each tool returns a text representation of the page (accessibility tree, DOM snapshot, or YAML). We tokenized every raw snapshot using [tiktoken](https://github.com/openai/tiktoken) (`cl100k_base` encoding). All token counts in the tables below are **real tokenizer output**, not estimates.

Earlier versions of this benchmark used characters ÷ 4 as a rough proxy. Actual tokenization showed this underestimates by 4–20% depending on the tool's format — structured text with brackets, short attribute names, and numbers tokenizes less efficiently than prose. The ratios between tools also shifted because each format tokenizes at a different rate (e.g. browser-use averages 3.3 chars/token, cdp-browser-mcp averages 3.6, chrome-devtools-mcp averages 3.2).

**How snapshots were captured:** Navigate to URL → wait 2–3 seconds for page load → capture the tool's DOM/accessibility representation. Each tool uses its own serialization format (see [format comparison](#why-the-differences) below).

**Full-page scroll test (browser-use only):** browser-use returns only the viewport-visible portion of the page. To measure the total cost of seeing the full page, we scrolled down by one viewport height at a time, re-captured the state at each position, and summed all viewport snapshots. This is what an LLM agent using browser-use would actually consume to read the entire page. For infinite-scroll pages (YouTube), we limited scrolling to the initial page height to keep the comparison fair.

### Per-snapshot results (8 page types, 2026-03-07)

All values are tokens measured with tiktoken `cl100k_base`. browser-use shows both per-viewport and full-page cost (sum of all scroll positions):

| # | Page type | browser-use (viewport) | browser-use (full page) | cdp-browser-mcp | chrome-devtools-mcp | Playwright MCP |
|---|---|---|---|---|---|---|
| 1 | Wikipedia (static article) | 2,698 | 66,067 (19 scrolls) | **7,092** | 67,946 | 58,138 |
| 2 | DataTables (data table) | 2,265 | 8,874 (4 scrolls) | **2,332** | 8,960 | 9,632 |
| 3 | Excalidraw (canvas app) | 980 | 986 | **282** | 1,075 | 1,553 |
| 4 | GitHub Issues (React SPA) | **899** | **874** | 4,006 | 9,616 | 17,597 |
| 5 | YouTube (iframe-heavy) | 11,510 | 50,544 (4 scrolls)† | **3,961** | 12,246 | 17,161 |
| 6 | Shoelace (web components) | 2,320 | 26,295 (9 scrolls) | **3,705** | 12,120 | 17,739 |
| 7 | example.com (minimal) | 28 | 28 | **31** | 98 | 87 |
| 8 | BBC News (news + ads) | 1,819 | 15,624 (7 scrolls) | **4,288** | 13,232 | 20,798 |

† YouTube has infinite scroll — new content lazy-loads as you scroll. We capped at 4 viewports (covering the initial 4,318px page height) for a fair comparison.

cdp-browser-mcp is a thin MCP wrapper around [`browser-autopilot`](https://www.npmjs.com/package/browser-autopilot)'s `CDPBrowser` — they produce identical snapshots (verified by running both independently on all 8 pages). The MCP layer adds zero token overhead.

**browser-use full-page cost:** When you need to see the entire page, browser-use's per-viewport advantage disappears. Wikipedia costs 66K tokens across 19 scrolls vs 7K in a single cdp-browser-mcp call (9.3x). YouTube costs 51K across 4 scrolls vs 4K (12.8x). browser-use wins only on pages that fit in a single viewport (GitHub Issues: 874 vs 4,006).

**cdp-browser-mcp vs chrome-devtools-mcp:** median **3.3x fewer tokens**, range 2.4x–9.6x.

**cdp-browser-mcp vs Playwright MCP:** median **4.6x fewer tokens**, range 2.8x–8.2x.

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

**Browser fingerprinting:** All 5 tools tested identically against [bot.sannysoft.com](https://bot.sannysoft.com) (30/30 pass) and Cloudflare Turnstile:

| Signal | Result (all tools) |
|---|---|
| `navigator.webdriver` | `false` |
| Chrome object present | Yes |
| Plugin count | 5 |
| Sannysoft pass rate | 30/30 |
| Cloudflare Turnstile | Challenge shown |

No stealth advantage at the fingerprinting level — they all present as real Chrome.

**Real-world anti-bot (Amazon):** During the initial benchmark run, Amazon served a 503 error page ("Sorry! Something went wrong!") to cdp-browser-mcp, chrome-devtools-mcp, and Playwright MCP — but loaded full search results for browser-use. All four tools were connected to the **same Chrome instance** via CDP.

We re-tested Amazon separately and all tools — including cdp-browser-mcp — loaded the full page without issue. The original blocking was likely **rate-based**: running 5 tools in rapid succession against the same pages triggered Amazon's request-rate detection, and the order tools ran in determined who got blocked (browser-use ran first).

Takeaway: basic fingerprinting tests (sannysoft, Cloudflare) show all tools as identical. Real-world anti-bot systems like Amazon's add server-side rate limiting that can produce inconsistent results depending on test conditions — but no tool has an inherent advantage.

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
