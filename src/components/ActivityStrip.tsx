import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RobotIcon,
  UserIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { relativeActivityTime } from "../lib/format";
import type { ActivityItem } from "../types";

export function ActivityStrip({ activities }: { activities: ActivityItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, Math.max(activities.length - 1, 0));
  const current = activities[safeIndex];

  if (!current) return null;

  const Icon =
    current.kind === "agent"
      ? RobotIcon
      : current.kind === "human"
        ? UserIcon
        : WrenchIcon;

  return (
    <section className="activity-strip" id="activity" aria-labelledby="activity-title">
      <div className="activity-heading">
        <h2 id="activity-title">Every agent action stays visible</h2>
      </div>
      <div className="activity-current" aria-live="polite">
        <span className="activity-icon" data-kind={current.kind} aria-hidden="true">
          <Icon weight="duotone" />
        </span>
        <div>
          <span>{relativeActivityTime(current.timestamp)}</span>
          <strong>{current.title}</strong>
          <p>{current.detail}</p>
        </div>
      </div>
      <div className="carousel-controls" aria-label="Activity controls">
        <button
          type="button"
          aria-label="Newer activity"
          disabled={safeIndex === 0}
          onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
        >
          <ArrowLeftIcon weight="bold" aria-hidden="true" />
        </button>
        <span>
          {safeIndex + 1} / {activities.length}
        </span>
        <button
          type="button"
          aria-label="Older activity"
          disabled={safeIndex === activities.length - 1}
          onClick={() =>
            setActiveIndex((index) => Math.min(activities.length - 1, index + 1))
          }
        >
          <ArrowRightIcon weight="bold" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
