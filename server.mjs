#!/usr/bin/env node
/**
 * CDPBrowser MCP Server
 *
 * Wraps browser-autopilot's CDPBrowser in an MCP server for Claude Code.
 * Uses Chrome's Accessibility API for DOM indexing — produces ~1.7K tokens
 * per page snapshot vs ~14K tokens from Playwright MCP (8.5x reduction).
 *
 * Connect to an existing Chrome instance on CDP port 9222.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CDPBrowser } from "browser-autopilot";

// ─── Config ──────────────────────────────────────────────────

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";

// ─── Browser Lifecycle ───────────────────────────────────────

let browser = null;

async function ensureBrowser() {
  if (browser) {
    try {
      await browser.currentUrl();
      return browser;
    } catch {
      // Chrome disconnected — reconnect
      browser = null;
    }
  }
  browser = new CDPBrowser();
  await browser.connect(CDP_URL);
  return browser;
}

async function getSnapshot() {
  const b = await ensureBrowser();
  const url = await b.currentUrl();
  const title = await b.pageTitle();
  const { text: domText, elements } = await b.getIndexedDOM();

  const header = [
    `URL: ${url}`,
    `Title: ${title}`,
    `Elements: ${elements.size} indexed`,
  ].join("\n");

  return `${header}\n\n${domText}`;
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function imageResult(base64, mimeType = "image/png") {
  return {
    content: [{ type: "image", data: base64, mimeType }],
  };
}

// ─── Tool Definitions ────────────────────────────────────────

const TOOLS = [
  // --- Navigation ---
  {
    name: "cdp_navigate",
    description:
      "Navigate to a URL. Returns the indexed DOM snapshot after loading.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to navigate to" },
      },
      required: ["url"],
    },
    handler: async ({ url }) => {
      const b = await ensureBrowser();
      await b.navigate(url);
      await b.waitMs(2000);
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_go_back",
    description: "Navigate back. Returns the updated DOM snapshot.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const b = await ensureBrowser();
      await b.goBack();
      await b.waitMs(1000);
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_reload",
    description: "Reload the current page. Returns the updated DOM snapshot.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const b = await ensureBrowser();
      await b.reload();
      await b.waitMs(2000);
      return textResult(await getSnapshot());
    },
  },

  // --- State ---
  {
    name: "cdp_snapshot",
    description:
      "Get the current page state as a compact indexed DOM. " +
      "Interactive elements shown as [N] role \"name\" where N is the index " +
      "for cdp_click/cdp_type. Content elements shown for context.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_screenshot",
    description:
      "Take a screenshot of the current page. Returns the image.",
    inputSchema: {
      type: "object",
      properties: {
        quality: {
          type: "number",
          description: "JPEG quality 1-100. Omit for PNG.",
        },
      },
    },
    handler: async ({ quality }) => {
      const b = await ensureBrowser();
      const base64 = await b.screenshot(quality ? { quality } : undefined);
      return imageResult(base64, quality ? "image/jpeg" : "image/png");
    },
  },
  {
    name: "cdp_page_text",
    description:
      "Extract the full visible text content of the page (document.body.innerText). " +
      "Useful when the accessibility tree doesn't capture all text (e.g. bios, prose).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const b = await ensureBrowser();
      const text = await b.getPageText();
      const url = await b.currentUrl();
      const title = await b.pageTitle();
      return textResult(`URL: ${url}\nTitle: ${title}\n\n${text}`);
    },
  },

  // --- Interaction ---
  {
    name: "cdp_click",
    description:
      "Click an element by its [N] index from cdp_snapshot. Returns updated DOM.",
    inputSchema: {
      type: "object",
      properties: {
        index: {
          type: "number",
          description: "Element index from the DOM snapshot",
        },
      },
      required: ["index"],
    },
    handler: async ({ index }) => {
      const b = await ensureBrowser();
      await b.clickByIndex(index);
      await b.waitMs(500);
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_type",
    description:
      "Type text into an element by its [N] index. Dispatches per-character " +
      "key events (works with React/Vue forms). Returns updated DOM.",
    inputSchema: {
      type: "object",
      properties: {
        index: {
          type: "number",
          description: "Element index from the DOM snapshot",
        },
        text: { type: "string", description: "Text to type" },
        clear: {
          type: "boolean",
          description: "Clear existing content first (default true)",
          default: true,
        },
      },
      required: ["index", "text"],
    },
    handler: async ({ index, text, clear = true }) => {
      const b = await ensureBrowser();
      await b.inputByIndex(index, text, clear);
      await b.waitMs(300);
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_press_key",
    description:
      'Press a keyboard key. Examples: "Enter", "Escape", "Tab", "ArrowDown", "Backspace".',
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key name to press" },
      },
      required: ["key"],
    },
    handler: async ({ key }) => {
      const b = await ensureBrowser();
      await b.pressKey(key);
      await b.waitMs(200);
      return textResult(`Pressed ${key}.`);
    },
  },
  {
    name: "cdp_scroll",
    description: 'Scroll the page. Direction: "up" or "down".',
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down"],
          description: "Scroll direction",
        },
        pixels: {
          type: "number",
          description: "Pixels to scroll (default 600)",
        },
      },
      required: ["direction"],
    },
    handler: async ({ direction, pixels }) => {
      const b = await ensureBrowser();
      await b.scroll(direction, pixels);
      await b.waitMs(300);
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_click_at",
    description:
      "Click at specific page coordinates. Useful for elements not in the accessibility tree.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate" },
        y: { type: "number", description: "Y coordinate" },
      },
      required: ["x", "y"],
    },
    handler: async ({ x, y }) => {
      const b = await ensureBrowser();
      await b.clickAtCoords(x, y);
      await b.waitMs(500);
      return textResult(await getSnapshot());
    },
  },

  // --- Tabs ---
  {
    name: "cdp_tabs",
    description:
      'Manage browser tabs. Actions: "list", "new", "switch", "close".',
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "new", "switch", "close"],
          description: "Tab action",
        },
        tabId: {
          type: "string",
          description: "Tab ID for switch/close actions",
        },
        url: {
          type: "string",
          description: "URL for new tab",
        },
      },
      required: ["action"],
    },
    handler: async ({ action, tabId, url }) => {
      const b = await ensureBrowser();
      switch (action) {
        case "list": {
          const tabs = await b.refreshTabs();
          const lines = tabs.map(
            (t, i) => `  [${i}] ${t.id} — ${t.url} "${t.title}"`
          );
          return textResult(`${tabs.length} tab(s):\n${lines.join("\n")}`);
        }
        case "new": {
          const id = await b.newTab(url);
          await b.waitMs(1000);
          return textResult(`Opened new tab ${id}. ${await getSnapshot()}`);
        }
        case "switch": {
          await b.switchTab(tabId);
          await b.waitMs(500);
          return textResult(await getSnapshot());
        }
        case "close": {
          await b.closeTab(tabId);
          return textResult("Tab closed.");
        }
        default:
          return textResult(`Unknown action: ${action}`);
      }
    },
  },

  // --- Advanced ---
  {
    name: "cdp_evaluate",
    description:
      "Execute JavaScript on the current page. Returns the result.",
    inputSchema: {
      type: "object",
      properties: {
        js: { type: "string", description: "JavaScript expression to evaluate" },
      },
      required: ["js"],
    },
    handler: async ({ js }) => {
      const b = await ensureBrowser();
      const result = await b.evaluate(js);
      return textResult(
        result === undefined || result === null
          ? "(no return value)"
          : String(result)
      );
    },
  },
  {
    name: "cdp_handle_dialog",
    description: "Accept or dismiss a browser dialog (alert, confirm, prompt).",
    inputSchema: {
      type: "object",
      properties: {
        accept: { type: "boolean", description: "Accept (true) or dismiss (false)" },
        text: { type: "string", description: "Text for prompt dialogs" },
      },
      required: ["accept"],
    },
    handler: async ({ accept, text }) => {
      const b = await ensureBrowser();
      await b.handleDialog(accept, text);
      return textResult(accept ? "Dialog accepted." : "Dialog dismissed.");
    },
  },
  {
    name: "cdp_wait",
    description: "Wait for a specified number of seconds.",
    inputSchema: {
      type: "object",
      properties: {
        seconds: { type: "number", description: "Seconds to wait" },
      },
      required: ["seconds"],
    },
    handler: async ({ seconds }) => {
      const b = await ensureBrowser();
      await b.waitMs(seconds * 1000);
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_wait_for_url",
    description:
      "Wait until the current URL contains a substring (e.g. after redirect).",
    inputSchema: {
      type: "object",
      properties: {
        substring: {
          type: "string",
          description: "URL substring to wait for",
        },
        timeout: {
          type: "number",
          description: "Max wait in milliseconds (default 10000)",
        },
      },
      required: ["substring"],
    },
    handler: async ({ substring, timeout }) => {
      const b = await ensureBrowser();
      await b.waitForUrl(substring, timeout || 10000);
      return textResult(await getSnapshot());
    },
  },
  {
    name: "cdp_element_html",
    description:
      "Get the HTML of an element by its [N] index. Useful for inspecting structure.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "number", description: "Element index" },
        inner: {
          type: "boolean",
          description: "Return innerHTML instead of outerHTML",
        },
      },
      required: ["index"],
    },
    handler: async ({ index, inner }) => {
      const b = await ensureBrowser();
      const html = await b.getElementHtml(index, inner);
      return textResult(html);
    },
  },
];

// ─── Server Setup ────────────────────────────────────────────

const server = new Server(
  { name: "cdp-browser", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name);
  if (!tool) {
    return textResult(`Unknown tool: ${request.params.name}`);
  }
  try {
    return await tool.handler(request.params.arguments || {});
  } catch (err) {
    return textResult(`Error in ${tool.name}: ${err.message}`);
  }
});

// ─── Start ───────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
