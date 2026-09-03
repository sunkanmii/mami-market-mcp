import { useState, type FormEvent } from "react";
import { buyerAgent, purchaseUnits, useBuyerAgent, validatePurchaseRequest, type PurchaseDraft, type PurchaseRequest } from "../lib/buyer-agent";
import { pilotApi, type PilotParticipant } from "../lib/pilot-api";
import { naira } from "../lib/format";

type RunMutation = (action: () => Promise<unknown>, message: string) => Promise<boolean>;
export function BuyerAgentPanel({ profile, busy, runMutation }: { profile: PilotParticipant; busy: boolean; runMutation: RunMutation }) {
  const state = useBuyerAgent();
  const draft = state.draft?.buyerId === profile.id ? state.draft : null;
  const search = state.search?.buyerId === profile.id ? state.search : null;
  return (
    <section className="buyer-agent-panel" id="buyer-agent-workspace" aria-labelledby="buyer-agent-title">
      <h3 id="buyer-agent-title">Your buying assistant</h3>
      <p>Ask your browser agent to find stock, prepare a request, or explain offers. You decide what to publish and accept.</p>
      <blockquote>“Find stock for my open requests and explain any offers sent to me.”</blockquote>
      <p className="form-note">Agent tools need a WebMCP-enabled browser. The forms below work in any browser.</p>
      {draft ? <RequestDraftForm key={draft.id} draft={draft} busy={busy} runMutation={runMutation} /> : null}
      {search ? (
        <section className="buyer-stock-results" aria-label="Agent stock search results" aria-live="polite">
          <h4>Stock for {search.query.itemName} · {search.query.unit}</h4>
          <p>Live listings at the time of search. Nothing is reserved. Confirm packaging, pickup time and delivery with the trader.</p>
          {search.items.length ? search.items.map((item) => (
            <article key={item.id} className="buyer-stock-result">
              <h5>{item.traderBusiness || item.traderName}</h5>
              <p>{item.availableQuantity} {item.unit} available · {naira.format(item.askingPricePerUnit)} per unit</p>
              <p>{item.pickupArea} · {item.sameArea ? "Same area label" : "Transport needs confirmation"}</p>
              {item.suggestedQuantity < search.query.requestedQuantity ? <p>Partial supply: {item.suggestedQuantity} of {search.query.requestedQuantity} {item.unit} requested.</p> : null}
              {item.priceStatus === "negotiation_needed" ? <p>Asking price exceeds your budget. A lower price is not agreed yet.</p> : null}
              {item.availableUntil ? <p>Available until {new Date(item.availableUntil).toLocaleString("en-NG")}</p> : null}
            </article>
          )) : <p>No compatible stock right now. Check the exact product name and unit, or publish a request for traders to respond.</p>}
        </section>
      ) : null}
    </section>
  );
}

function RequestDraftForm({ draft, busy, runMutation }: { draft: PurchaseDraft; busy: boolean; runMutation: RunMutation }) {
  const [error, setError] = useState("");
  const localDate = new Date(draft.neededBy);
  const dateValue = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "").trim();
    try {
      if (pilotApi.loadProfile()?.id !== draft.buyerId) throw new Error("Participant changed. Prepare a new draft for this buyer.");
      const request = validatePurchaseRequest({
        itemName: field("itemName"), category: field("category"), requestedQuantity: Number(field("requestedQuantity")),
        unit: field("unit"), maximumPricePerUnit: field("maximumPricePerUnit") === "" ? null : Number(field("maximumPricePerUnit")),
        neededBy: new Date(field("neededBy")).toISOString(), deliveryArea: field("deliveryArea"),
        fulfilmentPreference: field("fulfilmentPreference") as PurchaseRequest["fulfilmentPreference"],
      });
      const completed = await runMutation(() => pilotApi.createDemand({ ...request, buyerId: draft.buyerId }), "You approved and published the request. Traders can now respond.");
      if (completed) buyerAgent.discard(draft.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check your request details."); }
  };
  return (
    <form className="pilot-form buyer-request-draft" autoComplete="off" onSubmit={(event) => void publish(event)} aria-labelledby="request-draft-title">
      <div className="form-heading"><span>Unpublished · agent prepared</span><h3 id="request-draft-title">Review your request</h3></div>
      <p role="status">Edit any detail below. Nothing is sent until you approve. This draft is lost if you reload.</p>
      <div className="form-grid-two">
        <label>Product<input name="itemName" required maxLength={80} defaultValue={draft.itemName} /></label>
        <label>Category<input name="category" maxLength={40} defaultValue={draft.category ?? ""} /></label>
        <label>Quantity<input name="requestedQuantity" type="number" min="1" max="100000" step="1" required defaultValue={draft.requestedQuantity} /></label>
        <label>Unit<select name="unit" defaultValue={draft.unit}>{purchaseUnits.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label>Maximum price per unit (₦)<input name="maximumPricePerUnit" type="number" min="0" step="1" defaultValue={draft.maximumPricePerUnit ?? ""} /></label>
        <label>Needed by<input name="neededBy" type="datetime-local" required defaultValue={dateValue} /></label>
        <label>Collection area<input name="deliveryArea" required maxLength={80} defaultValue={draft.deliveryArea} /></label>
        <label>Fulfilment<select name="fulfilmentPreference" defaultValue={draft.fulfilmentPreference}><option value="pickup">I can pick up</option><option value="delivery">I need delivery</option><option value="either">Either works</option></select></label>
      </div>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <div className="offer-actions">
        <button type="submit" disabled={busy}>{busy ? "Publishing…" : "Approve and publish request"}</button>
        <button type="button" className="quiet-button" disabled={busy} onClick={() => buyerAgent.discard(draft.id)}>Discard request draft</button>
      </div>
    </form>
  );
}
