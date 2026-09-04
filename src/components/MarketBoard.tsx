import { useState } from "react";
import { buyerAgent } from "../lib/buyer-agent";
import { naira } from "../lib/format";
import { availability, sameProduct } from "../lib/market-availability";
import { pilotApi, type PilotDemand, type PilotInventory, type PilotParticipant, type PilotSnapshot } from "../lib/pilot-api";

interface Props {
  profile: PilotParticipant;
  snapshot: PilotSnapshot | null;
  busy: boolean;
  runMutation: (action: () => Promise<unknown>, message: string) => Promise<boolean>;
}
const reveal = (id: string) => requestAnimationFrame(() => {
  const element = document.getElementById(id);
  element?.scrollIntoView?.({ block: "start", behavior: "auto" });
  element?.focus({ preventScroll: true });
});

const normalizeFilter = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
function listingOptions(values: (string | null)[]) {
  const options = new Map<string, string>();
  for (const value of values) {
    const label = value?.trim().replace(/\s+/g, " ");
    if (label && !options.has(normalizeFilter(label))) options.set(normalizeFilter(label), label);
  }
  return [...options].sort((a, b) => a[1].localeCompare(b[1]));
}

export function MarketBoard({ profile, snapshot, busy, runMutation }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("available");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const buying = profile.role === "buyer";
  const offers = snapshot?.offers ?? [];
  const entries = buying ? snapshot?.inventory ?? [] : snapshot?.demands ?? [];
  const locations = listingOptions(entries.map((item) => "traderId" in item ? item.pickupArea : item.deliveryArea));
  const categories = listingOptions(entries.map((item) => item.category));
  const hasFilters = Boolean(query || location || category || filter !== "available");
  const clearFilters = () => { setQuery(""); setLocation(""); setCategory(""); setFilter("available"); };
  const visible = entries.filter((item) => {
    const area = "traderId" in item ? item.pickupArea : item.deliveryArea;
    return (filter === "all" || availability(item, offers).state === filter) &&
      (!location || normalizeFilter(area) === location) &&
      (!category || normalizeFilter(item.category ?? "") === category) &&
      normalizeFilter(`${item.itemName} ${area} ${item.category ?? ""}`).includes(normalizeFilter(query));
  });
  const requestStock = (item: PilotInventory) => {
    setError("");
    try {
      buyerAgent.prepare(profile.id, {
        itemName: item.itemName, category: item.category ?? undefined, unit: item.unit,
        requestedQuantity: 1, maximumPricePerUnit: item.askingPricePerUnit,
        neededBy: new Date(Math.min(Date.now() + 86_400_000, item.availableUntil ? Date.parse(item.availableUntil) : Infinity)).toISOString(),
        deliveryArea: item.pickupArea, fulfilmentPreference: "pickup",
      }, "buyer");
      reveal("buyer-agent-workspace");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare request."); }
  };
  const prepareOffer = async (item: PilotInventory, demand: PilotDemand) => {
    const succeeded = await runMutation(() => pilotApi.createOffer({
      inventoryId: item.id, demandId: demand.id, actorId: profile.id,
      quantity: Math.min(availability(item, offers).available, availability(demand, offers).available),
      pricePerUnit: demand.maximumPricePerUnit === null ? item.askingPricePerUnit : Math.min(item.askingPricePerUnit, demand.maximumPricePerUnit),
      pickupWindow: `By ${new Date(demand.neededBy).toLocaleString("en-NG")}`,
      note: "Confirm packaging and collection details before pickup.", createdBy: "trader",
    }), "Offer draft ready below. Review the terms before approving and sending to the buyer.");
    if (succeeded) reveal("trader-offers-title");
  };
  return <section className="market-board" aria-labelledby="market-board-title">
    <header><span className="eyebrow">Live market · shared across participants</span><h3 id="market-board-title">{buying ? "Browse stock for sale" : "Browse buyer requests"}</h3>
      <p>{buying ? "Choose goods to prepare an editable request. Publishing it invites matching traders to offer; it is not an order or reservation with this seller." : "See what buyers need. Respond using your matching stock, then review and send the offer."}</p>
    </header>
    <div className="market-filters">
      <label>Search product or area<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Watermelon or Ketu" /></label>
      <label>{buying ? "Pickup location" : "Buyer location"}<select value={location} onChange={(event) => setLocation(event.target.value)}>
        <option value="">All locations</option>
        {locations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        {location && !locations.some(([value]) => value === location) ? <option value={location}>{location} (no longer listed)</option> : null}
      </select></label>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="">All categories</option>
        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        {category && !categories.some(([value]) => value === category) ? <option value={category}>{category} (no longer listed)</option> : null}
      </select></label>
      <label>Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="available">Available</option><option value="reserved">Reserved</option><option value="closed">Closed</option><option value="all">All listings</option></select></label>
      <button type="button" className="compact-button market-clear-filters" disabled={!hasFilters} onClick={clearFilters}>Reset filters</button>
    </div>
    {error ? <p role="alert" className="inline-error">{error} <button type="button" className="text-button" onClick={() => reveal("buyer-agent-workspace")}>Review current draft</button></p> : null}
    <p className="market-result-count" role="status">{snapshot ? `${visible.length} ${buying ? "stock listing" : "buyer request"}${visible.length === 1 ? "" : "s"}` : "Waiting for live market data…"}</p>
    <div className="market-list">{visible.map((entry) => {
      const info = availability(entry, offers);
      const stock = "traderId" in entry;
      const ownStock = stock ? [] : snapshot?.inventory.filter((item) => item.traderId === profile.id && sameProduct(item, entry) && availability(item, offers).available > 0) ?? [];
      return <article className="market-listing" key={entry.id}>
        <span className="market-state" data-state={info.state}>{info.label}</span><h4>{entry.itemName}</h4>
        <p>{stock ? entry.traderBusiness || entry.traderName : entry.buyerBusiness || entry.buyerName} · {stock ? entry.pickupArea : entry.deliveryArea}</p>
        <dl><div><dt>{stock ? "Price per unit" : "Budget per unit"}</dt><dd>{stock ? naira.format(entry.askingPricePerUnit) : entry.maximumPricePerUnit === null ? "Open to offers" : naira.format(entry.maximumPricePerUnit)}</dd></div><div><dt>{stock ? "Available" : "Still needed"}</dt><dd>{info.available} {entry.unit}</dd></div><div><dt>Reserved</dt><dd>{info.reserved} {entry.unit}</dd></div><div><dt>{stock ? "Available until" : "Needed by"}</dt><dd>{(stock ? entry.availableUntil : entry.neededBy) ? new Date((stock ? entry.availableUntil : entry.neededBy)!).toLocaleString("en-NG") : "Flexible"}</dd></div></dl>
        {info.completed > 0 ? <p>{info.completed} completed exchange{info.completed === 1 ? "" : "s"} on this listing</p> : null}
        {stock ? <button className="compact-button" type="button" disabled={busy || info.available === 0} onClick={() => requestStock(entry)}>Prepare request for {entry.itemName}</button> : info.available > 0 ? ownStock.length ? ownStock.map((item) => {
          const pending = offers.find((offer) => offer.inventoryId === item.id && offer.demandId === entry.id && ["draft", "sent", "accepted"].includes(offer.status));
          return pending ? <a key={item.id} href="#trader-offers-title">View your {pending.status} offer</a> : <button key={item.id} className="compact-button" type="button" disabled={busy} onClick={() => void prepareOffer(item, entry)}>Prepare offer · {item.itemName} ({item.unit})</button>;
        }) : <p className="market-help">No compatible stock of yours yet. <a href="#seller-stock-form">Post stock</a> with the same product and unit ({entry.unit}) and a compatible price.</p> : <p>No new offers while this request is {info.state}.</p>}
      </article>;
    })}</div>
    {snapshot && visible.length === 0 ? <p className="empty-record">{hasFilters ? "No listings match these filters. Reset filters to see available listings, or try another location or category." : `No available ${buying ? "stock" : "requests"} yet. Check back as participants post.`}</p> : null}
  </section>;
}
