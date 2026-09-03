# Trader Network

Trader Network is a WebMCP-enabled surplus-stock exchange for informal market traders. It helps a trader inspect urgent inventory, find nearby demand, and prepare an offer for human approval before perishable goods lose value.

The application now has two deliberately separated modes:

- A closed, invite-only pilot backed by Cloudflare D1. Consenting traders and buyers can use different phones to post stock and demand, exchange an offer, and record whether pickup was completed.
- A clearly labelled illustrative fallback that keeps the WebMCP workflow judgeable when no pilot profile or live data is available.

**Live application:** https://trader-network.pages.dev/

## Why WebMCP

Conventional browser agents must interpret cards, buttons, and visual state before acting. Trader Network exposes the same client-side application logic as structured tools. The agent and trader therefore share one visible workspace instead of operating through a detached backend integration or brittle screen automation.

When a trader has joined the live pilot, the same four tools read and write the trader's D1-backed records. The agent can inspect and prepare; the trader controls sending the offer, and the buyer controls acceptance.

## Exposed tools

| Tool | Purpose | State change |
| --- | --- | --- |
| `get_inventory` | Read availability, prices, and freshness windows | None |
| `show_inventory_item` | Focus the visible workspace on one item | Visible selection only |
| `find_surplus_matches` | Return compatible live demand, or labelled illustrative matches | None |
| `draft_surplus_offer` | Prepare a reversible offer for review | Draft only; never sends |

Tools are registered through `document.modelContext.registerTool()` in [`src/lib/webmcp.ts`](src/lib/webmcp.ts). An `AbortController` unregisters them with the document lifecycle.

## Human-agent demo

Open the app in ChatGPT's in-app browser or a WebMCP-enabled Chrome build and ask:

> Review my urgent inventory. Find a compatible buyer for the tomatoes and prepare a fair offer for me to approve.

The expected tool sequence is:

1. `get_inventory({ urgentOnly: true })`
2. `show_inventory_item({ itemId: "tomatoes-roma" })`
3. `find_surplus_matches({ itemId: "tomatoes-roma", maxDistanceKm: 5 })`
4. `draft_surplus_offer({ itemId: "tomatoes-roma", quantity: 6, pricePerUnit: 27500, matchId: "buyer-amaka" })`
5. The trader reviews the visible draft and selects **Approve and send** or discards it.
6. In the live pilot, the matched buyer accepts or declines on a separate device and either participant can record completed pickup.

Payment, participant contact exchange, and delivery remain outside the platform. The pilot stores pseudonymous coordination records, not financial or identity documents.

## Run locally

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

For the complete Pages Functions + local D1 workflow, follow [`docs/D1_SETUP.md`](docs/D1_SETUP.md), build, and run:

```bash
npm run build
npx wrangler pages dev dist --port 8788
```

## Verify

```bash
npm test
npm run build
npm run typecheck:functions
```

The test suite covers WebMCP registration, structured inventory output, draft preparation, and explicit human approval.

The production deployment is hosted on Cloudflare Pages. It has been smoke-tested over HTTPS in ChatGPT's in-app browser, including discovery of all four WebMCP tools.

## Architecture

- React 19 + TypeScript + Vite frontend
- Cloudflare Pages Functions API with prepared D1 queries and server-side validation
- Cloudflare D1 tables for consenting participants, stock, demand, offers, pilot access, and visible activity
- One external store shared by React and WebMCP callbacks
- Per-device pilot profile plus versioned `localStorage` persistence for the illustrative demo
- Runtime WebMCP feature detection with a normal-browser demo fallback
- Phosphor icons and restrained GSAP motion with reduced-motion support
- Shared offer lifecycle: draft → sent → accepted/declined → completed

## Hackathon scope

This project was created during the OpenAI WebMCP Challenge submission period. It is intentionally limited to one measurable workflow: connecting time-sensitive surplus to compatible nearby demand. It is a facilitated, access-code-protected pilot rather than an open marketplace. Forecasting, payments, identity verification, and automated external messaging remain outside scope.

See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the video plan and [`docs/SUBMISSION_CHECKLIST.md`](docs/SUBMISSION_CHECKLIST.md) for the remaining release steps.

## Assets and licenses

- Source code: [MIT](LICENSE)
- Product photography: remote images from Unsplash, subject to the [Unsplash License](https://unsplash.com/license)
- Outfit typeface: served by Google Fonts under its listed open-font license
- Phosphor Icons: MIT License
