# Trader Network

Trader Network is a WebMCP-enabled surplus-stock exchange for informal market traders. It helps a trader inspect urgent inventory, find nearby demand, and prepare an offer for human approval before perishable goods lose value.

The current application is a focused hackathon prototype. All traders, inventory, prices, trust scores, and demand matches are illustrative demo data.

**Live application:** https://trader-network.pages.dev/

## Why WebMCP

Conventional browser agents must interpret cards, buttons, and visual state before acting. Trader Network exposes the same client-side application logic as structured tools. The agent and trader therefore share one visible workspace instead of operating through a detached backend integration or brittle screen automation.

The agent can research and prepare. The human controls the consequential step: publishing the offer.

## Exposed tools

| Tool | Purpose | State change |
| --- | --- | --- |
| `get_inventory` | Read availability, prices, and freshness windows | None |
| `show_inventory_item` | Focus the visible workspace on one item | Visible selection only |
| `find_surplus_matches` | Return nearby demand within a distance | None |
| `draft_surplus_offer` | Prepare a reversible offer for review | Draft only; never publishes |

Tools are registered through `document.modelContext.registerTool()` in [`src/lib/webmcp.ts`](src/lib/webmcp.ts). An `AbortController` unregisters them with the document lifecycle.

## Human-agent demo

Open the app in ChatGPT's in-app browser or a WebMCP-enabled Chrome build and ask:

> Review my urgent inventory. Find a trusted buyer within 5 km for the tomatoes and prepare a fair offer for me to approve.

The expected tool sequence is:

1. `get_inventory({ urgentOnly: true })`
2. `show_inventory_item({ itemId: "tomatoes-roma" })`
3. `find_surplus_matches({ itemId: "tomatoes-roma", maxDistanceKm: 5 })`
4. `draft_surplus_offer({ itemId: "tomatoes-roma", quantity: 6, pricePerUnit: 27500, matchId: "buyer-amaka" })`
5. The trader reviews the visible draft and selects **Approve and publish** or **Discard**.

No backend payment, message, or real-world inventory action occurs in this prototype.

## Run locally

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Verify

```bash
npm test
npm run build
```

The test suite covers WebMCP registration, structured inventory output, draft preparation, and explicit human approval.

The production deployment is hosted on Cloudflare Pages. It has been smoke-tested over HTTPS in ChatGPT's in-app browser, including discovery of all four WebMCP tools.

## Architecture

- React 19 + TypeScript + Vite
- One external store shared by React and WebMCP callbacks
- Versioned `localStorage` persistence for a repeatable browser demo
- Runtime WebMCP feature detection with a normal-browser demo fallback
- Phosphor icons and restrained GSAP motion with reduced-motion support
- Static production output suitable for Netlify, Cloudflare Pages, Vercel, or Render

## Hackathon scope

This project was created during the OpenAI WebMCP Challenge submission period. The repository is intentionally limited to one complete, judgeable workflow. Forecasting, payments, authentication, external messaging, and real marketplace integrations are outside this prototype's scope.

See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the video plan and [`docs/SUBMISSION_CHECKLIST.md`](docs/SUBMISSION_CHECKLIST.md) for the remaining release steps.

## Assets and licenses

- Source code: [MIT](LICENSE)
- Product photography: remote images from Unsplash, subject to the [Unsplash License](https://unsplash.com/license)
- Outfit typeface: served by Google Fonts under its listed open-font license
- Phosphor Icons: MIT License
