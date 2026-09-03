import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CodeIcon,
  MapPinIcon,
  SealCheckIcon,
  SparkleIcon,
  TrashIcon,
  UserCircleCheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { naira } from "../lib/format";
import { marketStore } from "../lib/store";
import type { MarketState } from "../types";

interface AssistPanelProps {
  state: MarketState;
}

const toolNames = [
  "get_inventory",
  "show_inventory_item",
  "find_surplus_matches",
  "draft_surplus_offer",
];

export function AssistPanel({ state }: AssistPanelProps) {
  const item = state.inventory.find(
    (entry) => entry.id === state.selectedItemId,
  )!;
  const itemMatches = useMemo(
    () =>
      state.matches
        .filter((match) => match.itemId === item.id)
        .toSorted((left, right) => right.matchScore - left.matchScore),
    [item.id, state.matches],
  );
  const [activeMatchId, setActiveMatchId] = useState<string | null>(
    itemMatches[0]?.id ?? null,
  );

  const createMatchDraft = (matchId: string, createdBy: "human" | "agent") => {
    const match = state.matches.find((entry) => entry.id === matchId)!;
    marketStore.createDraft({
      itemId: item.id,
      quantity: Math.min(match.requestedQuantity, item.quantity - item.reserved),
      pricePerUnit: Math.min(match.maxPricePerUnit, item.pricePerUnit),
      matchId: match.id,
      note: `Pickup: ${match.pickupWindow}. Confirm packaging before collection.`,
      createdBy,
    });
  };

  const previewAgentAssist = () => {
    const [bestMatch] = marketStore.findMatches({
      itemId: item.id,
      maxDistanceKm: 10,
    });
    if (bestMatch) createMatchDraft(bestMatch.id, "agent");
  };

  return (
    <aside className="assist-panel" aria-labelledby="assist-title">
      <div className="assist-heading">
        <div className="agent-orb" aria-hidden="true">
          <SparkleIcon weight="fill" />
        </div>
        <div>
          <h2 id="assist-title">Practice an agent-assisted offer</h2>
        </div>
      </div>

      <div className="mcp-status" data-status={state.webMcpStatus}>
        <span aria-hidden="true" />
        <p>
          <strong>
            {state.webMcpStatus === "connected"
              ? "4 WebMCP tools active"
              : state.webMcpStatus === "checking"
                ? "Checking WebMCP support"
                : "Illustrative sandbox active"}
          </strong>
          {state.webMcpStatus === "connected"
            ? "Your browser agent can work in this page."
            : "Use ChatGPT’s in-app browser or WebMCP-enabled Chrome for agent tools."}
        </p>
      </div>

      {state.draft ? (
        <DraftReview state={state} />
      ) : (
        <>
          <div className="prompt-card">
            <span>Try asking your browser agent</span>
            <blockquote>
              “I need to move my urgent stock today. Find a compatible buyer and
              prepare a fair offer for me to review.”
            </blockquote>
            <button
              className="text-button"
              type="button"
              onClick={previewAgentAssist}
              disabled={itemMatches.length === 0}
            >
              Preview that assist
              <ArrowRightIcon weight="bold" aria-hidden="true" />
            </button>
          </div>

          <div className="match-block">
            <div className="match-title-row">
              <h3>Illustrative demand nearby</h3>
              <span>{itemMatches.length} matches</span>
            </div>

            {itemMatches.length > 0 ? (
              <div className="match-accordion">
                {itemMatches.map((match) => {
                  const isActive = activeMatchId === match.id;
                  return (
                    <article className="match-card" data-active={isActive} key={match.id}>
                      <button
                        type="button"
                        className="match-card-trigger"
                        aria-expanded={isActive}
                        onClick={() => setActiveMatchId(match.id)}
                      >
                        <span className="match-avatar" aria-hidden="true">
                          {match.buyerName.charAt(0)}
                        </span>
                        <span>
                          <strong>{match.buyerName}</strong>
                          <small>
                            <MapPinIcon weight="fill" aria-hidden="true" />
                            {match.distanceKm} km · {match.market}
                          </small>
                        </span>
                        <span className="fit-score">
                          <SealCheckIcon weight="fill" aria-hidden="true" />
                          {match.matchScore}% fit
                        </span>
                      </button>
                      {isActive ? (
                        <div className="match-card-detail">
                          <div>
                            <span>Needs</span>
                            <strong>
                              {match.requestedQuantity} {item.unit}
                            </strong>
                          </div>
                          <div>
                            <span>Up to</span>
                            <strong>{naira.format(match.maxPricePerUnit)}</strong>
                          </div>
                          <div>
                            <span>Pickup</span>
                            <strong>{match.pickupWindow}</strong>
                          </div>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => createMatchDraft(match.id, "human")}
                          >
                            Prepare offer
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-match">
                <WarningCircleIcon weight="duotone" aria-hidden="true" />
                <p>
                  No seeded demand for this item yet. Select a perishable item to
                  continue the demo.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <details className="tool-disclosure">
        <summary>
          <CodeIcon weight="bold" aria-hidden="true" />
          Inspect exposed tools
        </summary>
        <ul>
          {toolNames.map((tool) => (
            <li key={tool}>
              <CheckIcon weight="bold" aria-hidden="true" />
              <code>{tool}</code>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

function DraftReview({ state }: { state: MarketState }) {
  const draft = state.draft!;
  const item = state.inventory.find((entry) => entry.id === draft.itemId)!;
  const match = state.matches.find((entry) => entry.id === draft.matchId);
  const isPublished = draft.status === "published";

  if (isPublished) {
    return (
      <div className="published-card" aria-live="polite">
        <span className="published-check" aria-hidden="true">
          <CheckIcon weight="bold" />
        </span>
        <h3>{draft.quantity} {item.unit} are now reserved</h3>
        <p>
          {match?.buyerName ?? "Nearby buyers"} can see the offer. Your approval
          created the only committed change in this flow.
        </p>
        <button className="secondary-button" type="button" onClick={() => marketStore.reset()}>
          Run the demo again
        </button>
      </div>
    );
  }

  return (
    <div className="draft-card" aria-live="polite">
      <div className="draft-banner">
        <SparkleIcon weight="fill" aria-hidden="true" />
        <span>
          <strong>{draft.createdBy === "agent" ? "Agent-prepared draft" : "Your offer draft"}</strong>
          Nothing is published until you approve.
        </span>
      </div>

      <div className="draft-product">
        <img
          src={item.imageUrl}
          alt=""
          width="112"
          height="112"
          loading="lazy"
        />
        <div>
          <span>{item.name}</span>
          <strong>
            {draft.quantity} {item.unit} × {naira.format(draft.pricePerUnit)}
          </strong>
        </div>
        <strong className="draft-total">
          {naira.format(draft.quantity * draft.pricePerUnit)}
        </strong>
      </div>

      <dl className="draft-details">
        <div>
          <dt>
            <UserCircleCheckIcon weight="duotone" aria-hidden="true" />
            Buyer
          </dt>
          <dd>{match?.buyerName ?? "Open marketplace"}</dd>
        </div>
        <div>
          <dt>
            <ClockIcon weight="duotone" aria-hidden="true" />
            Collection
          </dt>
          <dd>{match?.pickupWindow ?? "Arrange after matching"}</dd>
        </div>
      </dl>

      <p className="draft-note">{draft.note}</p>

      <div className="draft-actions">
        <button className="primary-button" type="button" onClick={() => marketStore.publishDraft()}>
          <CheckIcon weight="bold" aria-hidden="true" />
          Approve and publish
        </button>
        <button className="discard-button" type="button" onClick={() => marketStore.discardDraft()}>
          <TrashIcon weight="bold" aria-hidden="true" />
          Discard
        </button>
      </div>
    </div>
  );
}
