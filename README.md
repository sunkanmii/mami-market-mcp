# Trader Network

Trader Network is a WebMCP-enabled surplus-stock exchange for informal market traders. It helps a trader inspect urgent inventory, find nearby demand, and prepare an offer for human approval before perishable goods lose value.

The application now has two deliberately separated modes:

- A closed, invite-only pilot backed by Cloudflare D1. Consenting traders and buyers can use different phones to post stock and demand, exchange an offer, and record whether pickup was completed.
- A clearly labelled illustrative seller sandbox available to agents without a pilot profile. Registered participants never fall back to fictional data.

**Live application:** https://trader-network.pages.dev/

## Why WebMCP

Conventional browser agents must interpret cards, buttons, and visual state before acting. Trader Network exposes the same client-side application logic as structured tools. The agent and trader therefore share one visible workspace instead of operating through a detached backend integration or brittle screen automation.

The browser agent works according to the current device's role. Traders can inspect their stock, find demand and draft offers. Buyers can read their requests, find stock, review incoming offers and prepare editable purchase requests. People retain publishing, sending, acceptance and pickup decisions. Agents do not negotiate directly with other agents or execute payments.

## Exposed tools

| Tool | Purpose | State change |
| --- | --- | --- |
| `get_inventory` | Read availability, prices, and freshness windows | None |
| `show_inventory_item` | Focus the visible workspace on one item | Visible selection only |
| `find_surplus_matches` | Return compatible live demand, or labelled illustrative matches | None |
| `draft_surplus_offer` | Prepare a reversible offer for review | Draft only; never sends |
| `get_trade_context` | Identify the device's current role and time | None |
| `get_my_requests` | Read the current buyer's requests | None |
| `find_stock_for_request` | Find real compatible stock for a buyer | Shows search results; never reserves |
| `review_incoming_offers` | Explain offers sent to the current buyer, excluding unsent drafts | None |
| `draft_purchase_request` | Prepare an editable buyer request | In-memory draft only; buyer must publish |

The first four tools are seller-only (or illustrative when no profile exists). Buyer tools reject other roles. `get_trade_context` is available in either role. These result filters do not make public network records confidential; phone and meetup details use a separate authenticated post-acceptance API.

Tools are registered through `document.modelContext.registerTool()` in [`src/lib/webmcp.ts`](src/lib/webmcp.ts), with buyer definitions in [`src/lib/buyer-tools.ts`](src/lib/buyer-tools.ts). An `AbortController` unregisters them with the document lifecycle.

## Human-agent demo

Open the app in ChatGPT's in-app browser or a WebMCP-enabled Chrome build and ask:

> Review my urgent inventory. Find a compatible buyer for the tomatoes and prepare a fair offer for me to approve.

For the anonymous illustrative sandbox, the expected tool sequence is:

1. `get_inventory({ urgentOnly: true })`
2. `show_inventory_item({ itemId: "tomatoes-roma" })`
3. `find_surplus_matches({ itemId: "tomatoes-roma", maxDistanceKm: 5 })`
4. `draft_surplus_offer({ itemId: "tomatoes-roma", quantity: 6, pricePerUnit: 27500, matchId: "buyer-amaka" })`
5. The trader reviews the visible draft and selects **Approve and send** or discards it.
6. In the live pilot, the matched buyer accepts or declines on a separate device and either participant can record completed pickup.

For live trading, use IDs returned by the tools, not the illustrative IDs above. Start with `get_trade_context` to confirm the role. A buyer can ask: "Read my requests, find compatible stock, and explain any offers sent to me." They can also ask the agent to prepare a request using the product, whole-number quantity, unit, maximum price (or open budget), future deadline with timezone, collection area and pickup/delivery preference. The editable draft appears under **Your buying assistant**; only **Approve and publish request** writes it to D1. Discarding never writes it, and unpublished drafts are lost on reload.

Matching uses exact product names and units after trimming and lowercasing; it does not convert packs into crates. Buyer stock search subtracts accepted reservations and excludes expired stock. Same-area labels are prioritised but are not measured distances. A price below asking is only a negotiation possibility, and delivery and pickup arrangements still need human confirmation. Seller offer drafts require trader approval, then buyer acceptance; only confirm completed pickup after the actual exchange.

Payment and delivery remain outside the platform. Participants consent to storing a phone number and public meetup landmark; those details are excluded from network and matching responses and revealed only to the two participants after an offer is accepted. The pilot does not store financial records, identity documents, or verification photos.

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

The test suite covers role-aware WebMCP registration, buyer request/offer isolation, stock matching, reservations, validation, editable drafts, discard and explicit human approval.

The production deployment is hosted on Cloudflare Pages. Use the live URL in a WebMCP-enabled browser to exercise the registered tools alongside the participant interface.

## Architecture

- React 19 + TypeScript + Vite frontend
- Cloudflare Pages Functions API with prepared D1 queries and server-side validation
- Cloudflare D1 tables for consenting participants, stock, demand, offers, pilot access, and visible activity
- One external store shared by React and WebMCP callbacks
- Per-device pilot profile and hashed participant session; phone and meetup details have a separate post-acceptance API
- Runtime WebMCP feature detection with a normal-browser demo fallback
- Phosphor icons and restrained GSAP motion with reduced-motion support
- Shared offer lifecycle: draft → sent → accepted/declined → completed

## Hackathon scope

This project was created during the OpenAI WebMCP Challenge submission period. It is intentionally limited to one measurable workflow: connecting time-sensitive surplus to compatible nearby demand. It is a facilitated, access-code-protected pilot rather than an open marketplace. Forecasting, payments, hosted identity-photo verification, and automated external messaging remain outside scope; accepted participants coordinate by phone or WhatsApp and verify the person and goods at pickup.

## Assets and licenses

- Source code: [MIT](LICENSE)
- Product photography: remote images from Unsplash, subject to the [Unsplash License](https://unsplash.com/license)
- Outfit typeface: served by Google Fonts under its listed open-font license
- Phosphor Icons: MIT License
