import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  MapPinIcon,
  PackageIcon,
  ShoppingCartIcon,
  SignOutIcon,
  StorefrontIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { naira } from "../lib/format";
import {
  PilotApiError,
  pilotApi,
  type OfferStatus,
  type PilotInventory,
  type PilotMatch,
  type PilotOffer,
  type PilotParticipant,
  type PilotRole,
  type PilotSnapshot,
} from "../lib/pilot-api";

type JoinRole = Extract<PilotRole, "trader" | "buyer">;

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function readableDate(value: string | null): string {
  if (!value) return "Flexible";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function verificationLabel(status: string): string {
  if (status === "in_person_confirmed") return "Met in person";
  if (status === "contact_confirmed") return "Contact confirmed";
  return "Pilot participant";
}

export function PilotNetwork() {
  const [snapshot, setSnapshot] = useState<PilotSnapshot | null>(null);
  const [profile, setProfile] = useState<PilotParticipant | null>(() => pilotApi.loadProfile());
  const [hasAccessCode, setHasAccessCode] = useState(() => pilotApi.hasCode());
  const [joinRole, setJoinRole] = useState<JoinRole>("trader");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await pilotApi.getNetwork();
      setSnapshot(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The live network could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleNetworkChange = () => void refresh();
    window.addEventListener("trader-network:changed", handleNetworkChange);
    return () => window.removeEventListener("trader-network:changed", handleNetworkChange);
  }, [refresh]);

  const runMutation = useCallback(
    async (action: () => Promise<unknown>, successMessage: string) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await action();
        await refresh();
        setNotice(successMessage);
        return true;
      } catch (cause) {
        setError(
          cause instanceof PilotApiError || cause instanceof Error
            ? cause.message
            : "That action could not be completed.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const joinPilot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    pilotApi.saveCode(field(form, "pilotCode"));
    const completed = await runMutation(async () => {
      const result = await pilotApi.createParticipant({
        role: joinRole,
        displayName: field(form, "displayName"),
        businessName: field(form, "businessName"),
        marketName: field(form, "marketName"),
        area: field(form, "area"),
        consent: true,
      });
      pilotApi.saveProfile(result.participant);
      setProfile(result.participant);
      setHasAccessCode(true);
    }, "Your pilot profile is ready on this device.");
    if (!completed) pilotApi.clearCode();
  };

  const leavePilot = () => {
    pilotApi.clearProfile();
    setProfile(null);
    setHasAccessCode(false);
    setNotice("This device is no longer linked to a pilot participant.");
  };

  const metrics = useMemo(() => {
    const inventory = snapshot?.inventory.filter((item) =>
      ["available", "partially_matched"].includes(item.status),
    ).length ?? 0;
    const demands = snapshot?.demands.filter((item) =>
      ["open", "partially_matched"].includes(item.status),
    ).length ?? 0;
    const completed = snapshot?.offers.filter((offer) => offer.status === "completed").length ?? 0;
    return { inventory, demands, completed };
  }, [snapshot]);

  return (
    <section className="pilot-network" id="pilot" aria-labelledby="pilot-title">
      <header className="pilot-heading">
        <div>
          <span className="eyebrow">Closed real-world pilot</span>
          <h2 id="pilot-title">One network. Two sides of the trade.</h2>
          <p>
            Traders post time-sensitive stock. Buyers post what they need. The
            network records the offer from first match to completed pickup.
          </p>
        </div>
        <div className="data-status" data-online={Boolean(snapshot)}>
          <DatabaseIcon weight="duotone" aria-hidden="true" />
          <span>
            <strong>{snapshot ? "Cloudflare D1 connected" : loading ? "Checking live data" : "Live data unavailable"}</strong>
            {snapshot ? "Shared across different phones" : "The WebMCP demo below still works"}
          </span>
          <button type="button" onClick={() => void refresh()} aria-label="Refresh live pilot data">
            <ArrowClockwiseIcon weight="bold" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="pilot-metrics" aria-label="Live pilot totals">
        <div><strong>{metrics.inventory}</strong><span>available stock lines</span></div>
        <div><strong>{metrics.demands}</strong><span>open buyer requests</span></div>
        <div><strong>{metrics.completed}</strong><span>completed exchanges</span></div>
      </div>

      {error ? (
        <div className="pilot-feedback" data-kind="error" role="alert">
          <WarningCircleIcon weight="fill" aria-hidden="true" />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="pilot-feedback" data-kind="success" role="status">
          <CheckCircleIcon weight="fill" aria-hidden="true" />
          {notice}
        </div>
      ) : null}

      {!profile ? (
        <div className="pilot-join-layout">
          <div className="role-explainer">
            <span>Choose this device’s role</span>
            <div className="role-switch" role="group" aria-label="Pilot role">
              <button
                type="button"
                aria-pressed={joinRole === "trader"}
                onClick={() => setJoinRole("trader")}
              >
                <StorefrontIcon weight="duotone" aria-hidden="true" />
                <span><strong>I’m selling</strong>Post stock that needs to move</span>
              </button>
              <button
                type="button"
                aria-pressed={joinRole === "buyer"}
                onClick={() => setJoinRole("buyer")}
              >
                <ShoppingCartIcon weight="duotone" aria-hidden="true" />
                <span><strong>I’m buying</strong>Post goods you need to source</span>
              </button>
            </div>
            <p>
              Use a pseudonym or first name for public testing. Contact details
              stay with the pilot facilitator and are not stored here.
            </p>
          </div>

          <form className="pilot-form join-form" onSubmit={(event) => void joinPilot(event)}>
            <div className="form-heading">
              <span>Step 1</span>
              <h3>Create a {joinRole === "trader" ? "trader" : "buyer"} profile</h3>
            </div>
            <label>
              Pilot access code
              <input name="pilotCode" type="password" autoComplete="one-time-code" required />
              <small>Ask the facilitator for today’s private code.</small>
            </label>
            <div className="form-grid-two">
              <label>
                Display name
                <input name="displayName" maxLength={60} required placeholder="e.g. Ijeoma" />
              </label>
              <label>
                Business name <span>optional</span>
                <input name="businessName" maxLength={80} placeholder="e.g. Ijeoma Grocers" />
              </label>
              <label>
                Market <span>optional</span>
                <input name="marketName" maxLength={80} placeholder="e.g. Mile 12 Market" />
              </label>
              <label>
                Area
                <input name="area" maxLength={80} required placeholder="e.g. Ketu" />
              </label>
            </div>
            <label className="consent-field">
              <input name="consent" type="checkbox" required />
              <span>I agree that this pseudonymous activity may be used to evaluate this pilot.</span>
            </label>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Connecting…" : `Join as ${joinRole}`}
              <ArrowRightIcon weight="bold" aria-hidden="true" />
            </button>
          </form>
        </div>
      ) : !hasAccessCode ? (
        <form
          className="pilot-form reconnect-form"
          onSubmit={(event) => {
            event.preventDefault();
            pilotApi.saveCode(field(new FormData(event.currentTarget), "pilotCode"));
            setHasAccessCode(true);
            setNotice("This device is ready to reconnect to the live pilot.");
          }}
        >
          <div className="form-heading">
            <span>Reconnect</span>
            <h3>Enter today’s pilot access code</h3>
          </div>
          <p>
            Your participant profile is saved on this device, but the private
            code is kept only for the browser session.
          </p>
          <label>
            Pilot access code
            <input name="pilotCode" type="password" autoComplete="one-time-code" required />
          </label>
          <button className="primary-button" type="submit">
            Continue to your workspace
            <ArrowRightIcon weight="bold" aria-hidden="true" />
          </button>
          <button className="text-button" type="button" onClick={leavePilot}>
            Use a different participant
          </button>
        </form>
      ) : (
        <div className="pilot-session">
          <div className="participant-bar">
            <span className="participant-avatar" aria-hidden="true">{profile.displayName.charAt(0)}</span>
            <span>
              <small>{profile.role === "trader" ? "Selling from this device" : "Buying from this device"}</small>
              <strong>{profile.businessName || profile.displayName}</strong>
              <span><MapPinIcon weight="fill" aria-hidden="true" />{profile.area}</span>
            </span>
            <button type="button" onClick={leavePilot}>
              <SignOutIcon weight="bold" aria-hidden="true" />
              Change participant
            </button>
          </div>

          {profile.role === "trader" ? (
            <TraderPilot
              profile={profile}
              snapshot={snapshot}
              busy={busy}
              runMutation={runMutation}
            />
          ) : (
            <BuyerPilot
              profile={profile}
              snapshot={snapshot}
              busy={busy}
              runMutation={runMutation}
            />
          )}
        </div>
      )}
    </section>
  );
}

interface PilotRoleProps {
  profile: PilotParticipant;
  snapshot: PilotSnapshot | null;
  busy: boolean;
  runMutation: (action: () => Promise<unknown>, successMessage: string) => Promise<boolean>;
}

function TraderPilot({ profile, snapshot, busy, runMutation }: PilotRoleProps) {
  const inventory = snapshot?.inventory.filter((item) => item.traderId === profile.id) ?? [];
  const offers = snapshot?.offers.filter((offer) => offer.traderId === profile.id) ?? [];

  const submitInventory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const completed = await runMutation(
      () => pilotApi.createInventory({
        traderId: profile.id,
        itemName: field(form, "itemName"),
        category: field(form, "category"),
        quantity: Number(field(form, "quantity")),
        unit: field(form, "unit"),
        askingPricePerUnit: Number(field(form, "askingPricePerUnit")),
        minimumPricePerUnit: field(form, "minimumPricePerUnit") || null,
        availableUntil: field(form, "availableUntil")
          ? new Date(field(form, "availableUntil")).toISOString()
          : null,
        pickupArea: field(form, "pickupArea"),
        pickupNotes: field(form, "pickupNotes"),
      }),
      "Stock is live. Matching buyers can now be found from another device.",
    );
    if (completed) element.reset();
  };

  return (
    <div className="pilot-role-grid">
      <form className="pilot-form" onSubmit={(event) => void submitInventory(event)}>
        <div className="form-heading"><span>Seller input</span><h3>Post stock that needs to move</h3></div>
        <div className="form-grid-two">
          <label>Product<input name="itemName" required maxLength={80} placeholder="Roma tomatoes" /></label>
          <label>Category<input name="category" maxLength={40} placeholder="Produce" /></label>
          <label>Quantity<input name="quantity" type="number" min="1" step="1" required /></label>
          <label>Unit<select name="unit" required defaultValue="crates"><option>crates</option><option>baskets</option><option>bags</option><option>packs</option><option>kilograms</option></select></label>
          <label>Asking price per unit (₦)<input name="askingPricePerUnit" type="number" min="0" step="1" required /></label>
          <label>Lowest acceptable (₦) <span>optional</span><input name="minimumPricePerUnit" type="number" min="0" step="1" /></label>
          <label>Available until <span>optional</span><input name="availableUntil" type="datetime-local" /></label>
          <label>Pickup area<input name="pickupArea" required defaultValue={profile.area} /></label>
        </div>
        <label>Pickup note <span>optional</span><textarea name="pickupNotes" maxLength={180} rows={2} placeholder="Packaging or collection details" /></label>
        <button className="primary-button" type="submit" disabled={busy}>Publish stock<ArrowRightIcon weight="bold" aria-hidden="true" /></button>
      </form>

      <div className="pilot-records">
        <div className="records-heading"><div><span>Seller workspace</span><h3>Your live stock</h3></div><strong>{inventory.length}</strong></div>
        {inventory.length ? inventory.map((item) => (
          <SellerStock key={item.id} item={item} profile={profile} busy={busy} runMutation={runMutation} />
        )) : <EmptyRecord icon="stock" text="Post one genuine stock line to begin the pilot." />}
        <OfferList offers={offers} profile={profile} busy={busy} runMutation={runMutation} />
      </div>
    </div>
  );
}

function SellerStock({ item, profile, busy, runMutation }: {
  item: PilotInventory;
  profile: PilotParticipant;
  busy: boolean;
  runMutation: PilotRoleProps["runMutation"];
}) {
  const [matches, setMatches] = useState<PilotMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const findMatches = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await pilotApi.getMatches(item.id);
      setMatches(result.matches);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Matches could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const prepare = async (match: PilotMatch) => {
    const price = match.maximumPricePerUnit === null
      ? item.askingPricePerUnit
      : Math.min(item.askingPricePerUnit, match.maximumPricePerUnit);
    await runMutation(
      () => pilotApi.createOffer({
        inventoryId: item.id,
        demandId: match.demandId,
        actorId: profile.id,
        quantity: Math.min(item.quantity, match.requestedQuantity),
        pricePerUnit: price,
        pickupWindow: `By ${readableDate(match.neededBy)}`,
        note: "Confirm packaging and collection details before pickup.",
        createdBy: "trader",
      }),
      "A reversible offer draft is ready for your review.",
    );
  };

  return (
    <article className="pilot-record-card">
      <div className="record-icon"><PackageIcon weight="duotone" aria-hidden="true" /></div>
      <div className="record-main">
        <span>{item.status.replace("_", " ")}</span>
        <h4>{item.itemName}</h4>
        <p>{item.quantity} {item.unit} · {naira.format(item.askingPricePerUnit)} each</p>
        <small><ClockIcon weight="fill" aria-hidden="true" />Available until {readableDate(item.availableUntil)}</small>
      </div>
      <button className="compact-button" type="button" onClick={() => void findMatches()} disabled={loading}>
        {loading ? "Checking…" : "Find buyers"}
      </button>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      {matches ? (
        <div className="live-match-list">
          {matches.length ? matches.map((match) => (
            <div className="live-match" key={match.demandId}>
              <div>
                <strong>{match.buyerBusiness || match.buyerName}</strong>
                <span>{verificationLabel(match.verificationStatus)} · {match.deliveryArea}</span>
                <p>{match.requestedQuantity} {match.unit} needed by {readableDate(match.neededBy)}</p>
                <small>{match.matchReason}</small>
              </div>
              <button type="button" onClick={() => void prepare(match)} disabled={busy}>Prepare offer</button>
            </div>
          )) : <p className="no-match-copy">No compatible buyer request yet. Keep this page open and refresh after a buyer posts demand.</p>}
        </div>
      ) : null}
    </article>
  );
}

function BuyerPilot({ profile, snapshot, busy, runMutation }: PilotRoleProps) {
  const demands = snapshot?.demands.filter((item) => item.buyerId === profile.id) ?? [];
  const offers = snapshot?.offers.filter((offer) => offer.buyerId === profile.id) ?? [];

  const submitDemand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const completed = await runMutation(
      () => pilotApi.createDemand({
        buyerId: profile.id,
        itemName: field(form, "itemName"),
        category: field(form, "category"),
        requestedQuantity: Number(field(form, "requestedQuantity")),
        unit: field(form, "unit"),
        maximumPricePerUnit: field(form, "maximumPricePerUnit") || null,
        neededBy: new Date(field(form, "neededBy")).toISOString(),
        deliveryArea: field(form, "deliveryArea"),
        fulfilmentPreference: field(form, "fulfilmentPreference"),
      }),
      "Your request is live. A matching trader can now prepare an offer.",
    );
    if (completed) element.reset();
  };

  return (
    <div className="pilot-role-grid">
      <form className="pilot-form" onSubmit={(event) => void submitDemand(event)}>
        <div className="form-heading"><span>Buyer input</span><h3>Post goods you need to source</h3></div>
        <div className="form-grid-two">
          <label>Product<input name="itemName" required maxLength={80} placeholder="Roma tomatoes" /></label>
          <label>Category<input name="category" maxLength={40} placeholder="Produce" /></label>
          <label>Quantity<input name="requestedQuantity" type="number" min="1" step="1" required /></label>
          <label>Unit<select name="unit" required defaultValue="crates"><option>crates</option><option>baskets</option><option>bags</option><option>packs</option><option>kilograms</option></select></label>
          <label>Maximum price per unit (₦) <span>optional</span><input name="maximumPricePerUnit" type="number" min="0" step="1" /></label>
          <label>Needed by<input name="neededBy" type="datetime-local" required /></label>
          <label>Collection area<input name="deliveryArea" required defaultValue={profile.area} /></label>
          <label>Fulfilment<select name="fulfilmentPreference" defaultValue="pickup"><option value="pickup">I can pick up</option><option value="delivery">I need delivery</option><option value="either">Either works</option></select></label>
        </div>
        <button className="primary-button" type="submit" disabled={busy}>Publish request<ArrowRightIcon weight="bold" aria-hidden="true" /></button>
      </form>

      <div className="pilot-records">
        <div className="records-heading"><div><span>Buyer workspace</span><h3>Your open requests</h3></div><strong>{demands.length}</strong></div>
        {demands.length ? demands.map((demand) => (
          <article className="pilot-record-card" key={demand.id}>
            <div className="record-icon"><ShoppingCartIcon weight="duotone" aria-hidden="true" /></div>
            <div className="record-main">
              <span>{demand.status.replace("_", " ")}</span><h4>{demand.itemName}</h4>
              <p>{demand.requestedQuantity} {demand.unit} · {demand.maximumPricePerUnit === null ? "Price open" : `up to ${naira.format(demand.maximumPricePerUnit)}`}</p>
              <small><ClockIcon weight="fill" aria-hidden="true" />Needed by {readableDate(demand.neededBy)}</small>
            </div>
          </article>
        )) : <EmptyRecord icon="demand" text="Post one genuine buyer request to make demand visible to traders." />}
        <OfferList offers={offers} profile={profile} busy={busy} runMutation={runMutation} />
      </div>
    </div>
  );
}

function OfferList({ offers, profile, busy, runMutation }: {
  offers: PilotOffer[];
  profile: PilotParticipant;
  busy: boolean;
  runMutation: PilotRoleProps["runMutation"];
}) {
  const act = (offer: PilotOffer, status: OfferStatus) =>
    runMutation(
      () => pilotApi.updateOfferStatus(offer.id, status, profile.id),
      status === "sent" ? "The buyer can now review this offer on their device."
        : status === "accepted" ? "Offer accepted. Arrange collection outside the platform."
          : status === "completed" ? "Exchange completed and counted in the pilot results."
            : `Offer ${status}.`,
    );

  return (
    <section className="offer-stack" aria-labelledby={`${profile.role}-offers-title`}>
      <div className="records-heading"><div><span>Shared transaction state</span><h3 id={`${profile.role}-offers-title`}>Offers</h3></div><strong>{offers.length}</strong></div>
      {offers.length ? offers.map((offer) => (
        <article className="live-offer" key={offer.id}>
          <div className="offer-status" data-status={offer.status}>{offer.status}</div>
          <h4>{offer.quantity} {offer.unit} of {offer.itemName}</h4>
          <p>{naira.format(offer.pricePerUnit)} each · {naira.format(offer.quantity * offer.pricePerUnit)} total</p>
          <dl><div><dt>Trader</dt><dd>{offer.traderName}</dd></div><div><dt>Buyer</dt><dd>{offer.buyerName}</dd></div><div><dt>Pickup</dt><dd>{offer.pickupWindow}</dd></div></dl>
          <div className="offer-actions">
            {profile.role === "trader" && offer.status === "draft" ? <button type="button" onClick={() => void act(offer, "sent")} disabled={busy}>Approve and send</button> : null}
            {profile.role === "buyer" && offer.status === "sent" ? <><button type="button" onClick={() => void act(offer, "accepted")} disabled={busy}>Accept offer</button><button className="quiet-button" type="button" onClick={() => void act(offer, "declined")} disabled={busy}>Decline</button></> : null}
            {offer.status === "accepted" ? <button type="button" onClick={() => void act(offer, "completed")} disabled={busy}>Mark pickup complete</button> : null}
          </div>
        </article>
      )) : <EmptyRecord icon="offer" text={profile.role === "trader" ? "Prepared offers will appear here for approval." : "Offers sent by matched traders will appear here."} />}
    </section>
  );
}

function EmptyRecord({ icon, text }: { icon: "stock" | "demand" | "offer"; text: string }) {
  const Icon = icon === "stock" ? PackageIcon : icon === "demand" ? ShoppingCartIcon : ClockIcon;
  return <div className="empty-record"><Icon weight="duotone" aria-hidden="true" /><p>{text}</p></div>;
}
