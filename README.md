# Trader Network

Trader Network is a WebMCP-enabled marketplace that helps informal market traders connect surplus and time-sensitive perishable stock with buyers before it loses freshness or value. Whether goods are nearing the end of their freshness window or a seller simply wants to sell them soon, people and their browser agents can find compatible demand and prepare offers for human approval. Payment and pickup happen offline.

**Open source:** [MIT License](LICENSE). The repository includes a standard root-level `LICENSE` file for GitHub license detection. Third-party asset licenses are listed below.

The application now has two deliberately separated modes:

- A closed, invite-only pilot backed by Cloudflare D1. Consenting traders and buyers can use different phones to post stock and demand, exchange an offer, and record whether pickup was completed.
- A clearly labelled illustrative sandbox with seller and buyer views, available without a pilot profile. Registered participants never fall back to fictional data.

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

The first four tools are seller-only; the buyer tools require the buyer role. Without a registered profile, both roles work in **Agent sandbox** using its **Demo seller / Demo buyer** controls. Every sandbox result identifies `source: illustrative-demo`. A registered profile always takes precedence and never silently falls back to demo records. `get_trade_context` reports role and source before acting. These result filters do not make public network records confidential; phone and meetup details use a separate authenticated post-acceptance API.

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
6. Switch to **Demo buyer** to accept or decline the same offer. Acceptance reserves illustrative stock and shows fictional sample contact and pickup details, including non-dialable numbers. **Simulate completed pickup** updates only sandbox stock and demand, never live pilot totals.
7. In the live pilot, the matched buyer accepts or declines on a separate device and either participant can record completed pickup.

### Judge access: test both roles without credentials

Open https://trader-network.pages.dev/#demo-sandbox in a browser profile with no pilot registration. Do not share a real participant session, phone number, or pilot code. Select **Demo seller**, then run the seller sequence above. Before the human sends, select **Demo buyer** and ask `review_incoming_offers`: the unsent offer must not appear. After the human sends, the same tool returns the offer and total. Human-only buttons accept/decline and simulate pickup.

With **Demo buyer** selected, ask:

> Check get_trade_context and use only illustrative-demo data. Read my requests, find stock for my open request, and explain incoming offers. Do not accept or publish anything.

The agent can also call `draft_purchase_request` with the sample product, exact unit, quantity, budget, a future ISO deadline, collection area and fulfilment preference. An editable form appears; **Approve demo request** adds fictional demand for the demo seller, while **Discard request draft** publishes nothing. This bounded rehearsal supports the four sample catalog products; an unknown product cannot be published into it. Reset removes sandbox changes only. Drafts and search results are cleared on reload. No sandbox tool calls a live API.

Ordinary browsers can use the forms and role buttons; invoking agent tools requires a WebMCP-capable host. There is no embedded chatbot or autonomous payment agent.

In Chrome, enabling `chrome://flags/#enable-webmcp-testing` makes the browser API available, but the agent connection must also support tool discovery and invocation. Chrome's [WebMCP guide](https://developer.chrome.com/docs/ai/webmcp) describes the Model Context Tool Inspector for manual calls and agent testing. A browser automation connection that can read or click the page does not necessarily expose WebMCP invocation.

### What this pilot demonstrates

The platform's intended outcome is a buyer–seller connection and contact handoff, with payment and pickup arranged offline. Accepted connections and reported pickups are different events. The organiser tested the workflow as the buyer using a real seller's recorded watermelon inventory. That recorded completed entry is explicitly labelled a **recorded-stock rehearsal**; no physical sale, revenue, prevented waste, or independent buyer adoption is claimed. The original D1 history is preserved. A future pickup may be reported by a participant, but the app does not independently verify it.

## Browse and trade without an agent

- Buyers see **Browse stock for sale**. Select a listing to prepare an editable request, then explicitly publish it. This is an open request to compatible traders, not a direct purchase or reservation from the selected seller.
- Sellers see **Browse buyer requests**. A compatible stock line enables **Prepare offer**; review the draft under **Your offers & exchanges**, then approve and send it.
- Search by product or area and filter by listed location, category, and Available, Reserved, Closed, or All. Location/category options come from the actual records; no country is inferred. Accepted offers reserve quantities; sent offers do not. Expired and withdrawn listings are closed without being counted as completed sales.
- Both participants retain their offer history. An accepted offer awaits offline pickup; only a confirmed completed pickup appears as **Closed · pickup completed**.
- Units include crates, baskets, bags, packs, kilograms, and **piece**. Both sides must use the same unit; the app does not assume packaging conversions.

For live trading, use IDs returned by the tools, not the illustrative IDs above. Start with `get_trade_context` to confirm the role. A buyer can ask: "Read my requests, find compatible stock, and explain any offers sent to me." They can also ask the agent to prepare a request using the product, whole-number quantity, unit, maximum price (or open budget), future deadline with timezone, collection area and pickup/delivery preference. The editable draft appears under **Your buying assistant**; only **Approve and publish request** writes it to D1. Discarding never writes it, and unpublished drafts are lost on reload.

Matching uses exact product names and units after trimming and lowercasing; it does not convert packs into crates. Buyer stock search subtracts accepted reservations and excludes expired stock. Same-area labels are prioritised but are not measured distances. A price below asking is only a negotiation possibility, and delivery and pickup arrangements still need human confirmation. Seller offer drafts require trader approval, then buyer acceptance; only confirm completed pickup after the actual exchange.

Payment and delivery remain outside the platform. Participants consent to storing a phone number and public meetup landmark; those details are excluded from network and matching responses and revealed only to the two participants after an offer is accepted. The pilot does not store financial records, identity documents, or verification photos.

Local phone numbers are accepted without adding or inferring a country code. Participants are advised to enter `+` and their own country's calling code for international contact and direct WhatsApp links. Formatting separators are removed, but leading local zeros and explicitly supplied country codes are preserved. Numbers without an explicit international prefix remain visible in the handoff, with guidance instead of a guessed WhatsApp link. Existing saved numbers are not rewritten by this change.

## Run locally

Requirements: Node.js 24 or later (including the SQLite API test runner).

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

Vite proxies `/api` to a Pages backend at `http://127.0.0.1:8788` by default; Vite alone does not run D1 or Pages Functions. Start the local backend below for isolated development.

To deliberately connect the development UI to the real pilot, create an ignored `.env.development.local` file containing `PILOT_API_TARGET=https://trader-network.pages.dev`, then restart Vite. **Form submissions in that mode affect real pilot data.** Use mocks or local D1 for automated tests. Remove that override to return to the local backend. The proxy does not change the production site's same-origin API or transfer participant sessions between browser origins.

For the complete Pages Functions + local D1 workflow, follow [`docs/D1_SETUP.md`](docs/D1_SETUP.md), build, and run:

```bash
npm run build
npx wrangler pages dev dist --port 8788
```

## Verify

```bash
npm test
npm run test:api
npm run build
npm run typecheck:functions
```

The test suite covers role-aware WebMCP registration, anonymous buyer/seller isolation, stock matching, reservations, validation, editable drafts, discard and explicit human approval. `test:api` executes the real API queries against in-memory SQLite, including expired records, competing stock/demand acceptances, repeated completion and cancellation races. It does not access D1. Status changes use transactional conditional writes; a failed status/capacity check cannot produce downstream stock decrements or a success event.

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

This project was created during the OpenAI WebMCP Challenge submission period. Its scope is one focused workflow: connecting surplus and time-sensitive perishable goods with compatible buyers while the goods are still suitable for sale. This includes stock nearing the end of its freshness window and stock a trader wants to sell sooner. It is a facilitated, access-code-protected pilot rather than an open marketplace. Forecasting, payments, hosted identity-photo verification, and automated external messaging remain outside scope; accepted participants coordinate by phone or WhatsApp and verify the person and goods at pickup. Freshness windows are participant-provided, not a food-safety assessment or a guarantee that goods are safe to consume.

## Assets and licenses

- Source code: [MIT](LICENSE)
- Product photography: remote images from Unsplash, subject to the [Unsplash License](https://unsplash.com/license)
- Outfit typeface: served by Google Fonts under its listed open-font license
