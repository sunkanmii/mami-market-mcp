import { marketStore } from "../lib/store";
import { naira } from "../lib/format";
import type { MarketState } from "../types";
import { RequestDraftForm } from "./BuyerAgentPanel";
import { pilotApi } from "../lib/pilot-api";

export function DemoRoleControls({ state }: { state: MarketState }) {
  const status = state.draft?.status;
  const step = !status || status === "draft" ? 0 : status === "sent" ? 1 : status === "accepted" ? 2 : status === "completed" ? 3 : 1;
  return <div className="demo-role-controls" id="sandbox-role-heading">
    <div><h3>Follow both sides of one trade</h3><p>One-device rehearsal with fictional participants. Switching views does not change your live pilot profile.</p></div>
    <div className="role-switch" role="group" aria-label="Illustrative trading role">
      <button type="button" aria-pressed={state.sandboxRole === "seller"} onClick={() => marketStore.setSandboxRole("seller")}>Demo seller</button>
      <button type="button" aria-pressed={state.sandboxRole === "buyer"} onClick={() => marketStore.setSandboxRole("buyer")}>Demo buyer</button>
    </div>
    <p>{pilotApi.loadProfile() ? "Your agent still uses your registered live profile. To test anonymous sandbox tools, open this sandbox URL in a fresh browser profile with no pilot registration. No real credentials should be shared." : `Agent tools now use the fictional ${state.sandboxRole} role. No login, pilot code or real participant credentials are needed.`}</p>
    <p>Ask in your browser’s agent chat: {state.sandboxRole === "buyer" ? "“Check get_trade_context, read my requests, find stock and review my incoming offers. Use only illustrative-demo data.”" : "“Check get_trade_context, find urgent stock and compatible demand, then prepare an offer for my review. Use only illustrative-demo data.”"}</p>
    <ol className="demo-trade-steps" aria-label="Illustrative trade progress">{["Seller prepares", "Buyer reviews", "Arrange pickup", "Complete"].map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}>{index + 1}. {label}</li>)}</ol>
  </div>;
}

export function DemoBuyerWorkspace({ state }: { state: MarketState }) {
  const match = state.matches.find((entry) => entry.id === state.draft?.matchId) ?? state.matches.find((entry) => entry.itemId === state.selectedItemId);
  return <>
    <section className="demo-buyer-request" aria-labelledby="demo-buyer-title">
      <span className="eyebrow">Buyer side · fictional participant</span>
      <h2 id="demo-buyer-title">{match?.buyerName ?? "Sample buyer"}</h2>
      <p>This is the buyer’s view of the same illustrative trade—not a second real account.</p>
      <h3>Your sample requests</h3>
      {match ? marketStore.demoRequests().map((request) => <article key={request.id} className="buyer-stock-result"><h4>{request.itemName}</h4><p>{request.requestedQuantity} {request.unit} still needed · {request.status}</p><p>Budget: {request.maximumPricePerUnit === null ? "Open" : `${naira.format(request.maximumPricePerUnit)} per unit`}</p><p>Collection area: {request.deliveryArea}</p></article>) : <p>No sample request for this item. Choose Roma tomatoes on the seller side to rehearse the full exchange.</p>}
      <button className="compact-button" type="button" onClick={() => marketStore.setSandboxRole("seller")}>Go to demo seller</button>
      <h3>Try the buyer’s agent tools</h3>
      <p>Ask your browser agent to read your requests, find stock, explain sent offers or draft a request. Drafting never publishes or reserves goods.</p>
      {state.sandboxBuyerDraft ? <RequestDraftForm key={state.sandboxBuyerDraft.id} draft={state.sandboxBuyerDraft} sandbox /> : null}
      {state.sandboxSearch ? <section className="buyer-stock-results" aria-label="Illustrative stock search results" aria-live="polite"><h3>Sample stock for {state.sandboxSearch.query.itemName}</h3>
        {state.sandboxSearch.items.length ? state.sandboxSearch.items.map((stock) => <article className="buyer-stock-result" key={stock.id}><h4>{stock.name}</h4><p>{stock.availableQuantity} {stock.unit} available · {naira.format(stock.pricePerUnit)} per unit</p>{state.sandboxSearch!.query.maximumPricePerUnit !== null && state.sandboxSearch!.query.maximumPricePerUnit! < stock.pricePerUnit ? <p>Above your budget; a lower price is not agreed.</p> : null}</article>) : <p>No matching sample stock. Check the exact product name and unit.</p>}
        <p>Fictional listings. Nothing reserved; pickup and delivery are not promised.</p>
      </section> : null}
    </section>
    <aside className="assist-panel demo-buyer-inbox" aria-labelledby="demo-inbox-title">
      <h2 id="demo-inbox-title">Buyer’s offer inbox</h2>
      {!state.draft || state.draft.status === "draft" ? <div className="demo-offer-progress"><h3>No offer received yet</h3><p>The seller’s unsent draft stays on the seller side. Switch to Demo seller, prepare the offer and select Approve and send.</p><button className="secondary-button" type="button" onClick={() => marketStore.setSandboxRole("seller")}>Go to seller to send an offer</button></div> : <DemoOfferStatus state={state} view="buyer" />}
    </aside>
  </>;
}

export function DemoOfferStatus({ state, view }: { state: MarketState; view: "seller" | "buyer" }) {
  const offer = state.draft!;
  const item = state.inventory.find((entry) => entry.id === offer.itemId)!;
  const match = state.matches.find((entry) => entry.id === offer.matchId);
  const accepted = offer.status === "accepted" || offer.status === "completed";
  const titles = { draft: "Draft", sent: view === "buyer" ? "An offer is waiting for you" : "Offer sent · waiting for buyer", accepted: "Buyer accepted · arrange pickup", declined: "Buyer declined · no deal", completed: "Simulated exchange completed" };
  return <div className="demo-offer-progress" aria-live="polite">
    <span className="demo-trade-status">Illustrative · {offer.status}</span>
    <h3>{titles[offer.status]}</h3>
    <dl><div><dt>Seller</dt><dd>Sample market trader</dd></div><div><dt>Buyer</dt><dd>{match?.buyerName ?? "Sample buyer"}</dd></div><div><dt>Goods</dt><dd>{offer.quantity} {item.unit} of {item.name}</dd></div><div><dt>Total</dt><dd>{naira.format(offer.quantity * offer.pricePerUnit)} · {naira.format(offer.pricePerUnit)} per unit</dd></div><div><dt>Pickup window</dt><dd>{match?.pickupWindow ?? "Arrange together"}</dd></div></dl>
    {offer.status === "sent" ? <>
      <p>No stock is reserved until the buyer accepts. Contact details are not revealed yet.</p>
      {view === "seller" ? <button className="secondary-button" type="button" onClick={() => marketStore.setSandboxRole("buyer")}>View offer as demo buyer</button> : <div className="demo-offer-actions"><button className="secondary-button" type="button" onClick={() => marketStore.respondToDemoOffer("accepted")}>Accept demo offer</button><button className="secondary-button" type="button" onClick={() => marketStore.respondToDemoOffer("declined")}>Decline demo offer</button></div>}
    </> : null}
    {accepted ? <div className="demo-contact-handoff">
      <h4>{view === "buyer" ? "Seller contact handoff" : "Buyer contact handoff"}</h4>
      <p>Fictional contact details · unlocked by accepting this demo offer.</p>
      <dl>
        <div><dt>Contact</dt><dd>{view === "buyer" ? "Tola · Sample market trader" : match?.buyerName ?? "Amaka Fresh Foods"}</dd></div>
        <div><dt>Phone / WhatsApp</dt><dd>{view === "buyer" ? "080X 000 0101" : "080X 000 0102"}</dd></div>
        <div><dt>Meetup</dt><dd>Stall A12, Sample Market · beside the main gate</dd></div>
        <div><dt>Pickup plan</dt><dd>{match?.pickupWindow ?? "Today, 4–6 PM"} · inspect the goods together before payment</dd></div>
      </dl>
      <p>The X makes these demo numbers non-dialable. This fictional handoff does not call or message anyone.</p>
    </div> : null}
    {offer.status === "accepted" ? <><p>{offer.quantity} {item.unit} are reserved in this demo, but pickup is not complete.</p><button className="secondary-button" type="button" onClick={() => marketStore.completeDemoOffer()}>Simulate completed pickup</button></> : null}
    {offer.status === "completed" ? <p>Illustrative stock and demand updated. No real sale occurred; live pilot totals are unchanged.</p> : null}
    {offer.status === "declined" ? <p>No stock was reserved. The seller can try a different offer in a new rehearsal.</p> : null}
    {offer.status !== "sent" ? <button className="secondary-button" type="button" onClick={() => marketStore.setSandboxRole(view === "buyer" ? "seller" : "buyer")}>View {view === "buyer" ? "seller" : "buyer"} side</button> : null}
    {["completed", "declined"].includes(offer.status) ? <button className="secondary-button" type="button" onClick={() => marketStore.reset()}>Restart illustrative trade</button> : null}
  </div>;
}
