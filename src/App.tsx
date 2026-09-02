import {
  ArrowCounterClockwise,
  ArrowDown,
  CheckCircle,
  Handshake,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { ActivityStrip } from "./components/ActivityStrip";
import { AssistPanel } from "./components/AssistPanel";
import { Brand } from "./components/Brand";
import { InventoryWorkspace } from "./components/InventoryWorkspace";
import { marketStore, useMarketState } from "./lib/store";
import { registerMarketTools } from "./lib/webmcp";

function App() {
  const state = useMarketState();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let disposed = false;
    let unregister: () => void = () => undefined;

    void registerMarketTools().then((cleanup) => {
      if (disposed) cleanup();
      else unregister = cleanup;
    });

    return () => {
      disposed = true;
      unregister();
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cleanup: () => void = () => undefined;

    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([{ gsap }, { ScrollTrigger }]) => {
        gsap.registerPlugin(ScrollTrigger);
        const context = gsap.context(() => {
          gsap.fromTo(
            ".inventory-row",
            { opacity: 0, y: 18 },
            {
              opacity: 1,
              y: 0,
              duration: 0.42,
              stagger: 0.06,
              ease: "power2.out",
            },
          );
          gsap.fromTo(
            ".selected-image img",
            { scale: 0.92, opacity: 0.72 },
            {
              scale: 1,
              opacity: 1,
              ease: "power1.out",
              scrollTrigger: {
                trigger: ".selected-summary",
                start: "top 88%",
                end: "bottom 65%",
                scrub: 0.4,
              },
            },
          );
        }, mainRef);
        cleanup = () => context.revert();
      },
    );

    return () => cleanup();
  }, []);

  return (
    <main className="app-shell" id="top" ref={mainRef}>
      <a className="skip-link" href="#workspace">
        Skip to Market Workspace
      </a>
      <header className="topbar">
        <div className="brand-group">
          <Brand />
          <span className="demo-data">Illustrative data</span>
        </div>
        <nav aria-label="Primary navigation">
          <a href="#workspace">Workspace</a>
          <a href="#activity">Activity</a>
        </nav>
        <button className="reset-button" type="button" onClick={() => marketStore.reset()}>
          <ArrowCounterClockwise weight="bold" aria-hidden="true" />
          Reset demo
        </button>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">
            Move stock
            <span
              className="hero-inline-image"
              role="img"
              aria-label="Crates of fresh tomatoes at a market"
            />
            before it loses value.
          </h1>
          <p>
            Trader Network helps informal market traders find nearby demand and
            prepare safe, reviewable offers before perishable goods lose value.
          </p>
          <a className="hero-action" href="#workspace">
            Review today’s stock
            <ArrowDown weight="bold" aria-hidden="true" />
          </a>
        </div>
        <div className="hero-proof" aria-label="Product principles">
          <div>
            <Handshake weight="duotone" aria-hidden="true" />
            <span>
              <strong>Agent prepares</strong>
              Matches demand and drafts the offer.
            </span>
          </div>
          <div>
            <CheckCircle weight="duotone" aria-hidden="true" />
            <span>
              <strong>Trader decides</strong>
              Nothing publishes without approval.
            </span>
          </div>
        </div>
      </section>

      <div className="workspace" id="workspace">
        <InventoryWorkspace
          inventory={state.inventory}
          selectedItemId={state.selectedItemId}
        />
        <AssistPanel state={state} />
      </div>

      <ActivityStrip activities={state.activities} />

      <footer className="footer-cta">
        <div>
          <h2>Open this page in a WebMCP-enabled browser.</h2>
          <p>
            Ask the agent to inspect urgent inventory, find demand, and prepare
            an offer. You stay in control of the final action.
          </p>
        </div>
        <a className="footer-action" href="#workspace">
          See the shared workspace
          <ArrowDown weight="bold" aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}

export default App;
