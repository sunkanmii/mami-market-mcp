import {
  ArrowRightIcon,
  BasketIcon,
  ClockCountdownIcon,
  PackageIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { marketStore } from "../lib/store";
import { naira, urgencyLabel } from "../lib/format";
import type { InventoryItem } from "../types";

interface InventoryWorkspaceProps {
  inventory: InventoryItem[];
  selectedItemId: string;
}

function ItemIcon({ category }: { category: InventoryItem["category"] }) {
  if (category === "Produce") return <BasketIcon weight="duotone" />;
  return <PackageIcon weight="duotone" />;
}

export function InventoryWorkspace({
  inventory,
  selectedItemId,
}: InventoryWorkspaceProps) {
  const selectedItem = inventory.find((item) => item.id === selectedItemId)!;
  const urgentCount = inventory.filter(
    (item) => item.expiresInHours !== null && item.expiresInHours <= 48,
  ).length;

  return (
    <section className="inventory-section" aria-labelledby="inventory-title">
      <div className="section-heading">
        <div>
          <h2 id="inventory-title">What needs your attention</h2>
        </div>
        <div className="urgency-count" aria-label={`${urgentCount} urgent items`}>
          <ClockCountdownIcon weight="bold" aria-hidden="true" />
          <span>{urgentCount} moving soon</span>
        </div>
      </div>

      <div className="inventory-list" role="list" aria-label="Inventory items">
        {inventory.map((item) => {
          const isSelected = item.id === selectedItemId;
          const available = item.quantity - item.reserved;
          const isUrgent =
            item.expiresInHours !== null && item.expiresInHours <= 24;

          return (
            <button
              className="inventory-row"
              data-selected={isSelected}
              key={item.id}
              onClick={() => marketStore.selectItem(item.id)}
              type="button"
              aria-pressed={isSelected}
            >
              <span className="item-thumbnail" aria-hidden="true">
                <img
                  src={item.imageUrl}
                  alt=""
                  width="120"
                  height="120"
                  loading="lazy"
                />
                <span className="item-icon">
                  <ItemIcon category={item.category} />
                </span>
              </span>
              <span className="item-primary">
                <strong>{item.name}</strong>
                <span>
                  {available} {item.unit} available
                </span>
              </span>
              <span className="item-freshness" data-urgent={isUrgent}>
                {urgencyLabel(item.expiresInHours)}
              </span>
              <span className="item-price">
                <strong>{naira.format(item.pricePerUnit)}</strong>
                <span>per {item.unit.replace(/s$/, "")}</span>
              </span>
              <ArrowRightIcon className="row-arrow" weight="bold" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="selected-summary" aria-live="polite">
        <div className="selected-image">
          <img
            src={selectedItem.imageUrl}
            alt={selectedItem.name}
            width="236"
            height="204"
            loading="lazy"
          />
        </div>
        <div>
          <span className="summary-kicker">Shared workspace</span>
          <h3>{selectedItem.name}</h3>
          <p>
            {selectedItem.soldToday} {selectedItem.unit} sold today. The agent can
            inspect this same inventory record and find verified demand without
            scraping the screen.
          </p>
        </div>
        <div className="shared-state-note">
          <ShieldCheckIcon weight="duotone" aria-hidden="true" />
          <span>
            <strong>One shared state</strong>
            Human and agent see the same stock.
          </span>
        </div>
      </div>
    </section>
  );
}
