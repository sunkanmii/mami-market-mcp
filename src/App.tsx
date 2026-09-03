import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  CaretDownIcon,
  CheckCircleIcon,
  FlaskIcon,
  HandshakeIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ActivityStrip } from "./components/ActivityStrip";
import { AssistPanel } from "./components/AssistPanel";
import { Brand } from "./components/Brand";
import { InventoryWorkspace } from "./components/InventoryWorkspace";
import { PilotNetwork } from "./components/PilotNetwork";
import { marketStore, useMarketState } from "./lib/store";
import { registerMarketTools } from "./lib/webmcp";

function App() {
  const state = useMarketState();
  const mainRef = useRef<HTMLElement>(null);
  const [demoOpen, setDemoOpen] = useState(false);

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
    const openDemo = () => {
      setDemoOpen(true);
      window.requestAnimationFrame(() => {
        document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    window.addEventListener("trader-network:open-demo", openDemo);
    return () => window.removeEventListener("trader-network:open-demo", openDemo);
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
      <a className="skip-link" href="#pilot">
        Skip to live pilot
      </a>
      <header className="topbar">
        <div className="brand-group">
          <Brand />
          <span className="demo-data">Live pilot</span>
        </div>
        <nav aria-label="Primary navigation">
          <a href="#pilot">Live pilot</a>
          <a href="#demo-sandbox" onClick={() => setDemoOpen(true)}>Agent sandbox</a>
        </nav>
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
          <a className="hero-action" href="#pilot">
            Open the live pilot
            <ArrowDownIcon weight="bold" aria-hidden="true" />
          </a>
        </div>
        <div className="hero-proof" aria-label="Product principles">
          <div>
            <HandshakeIcon weight="duotone" aria-hidden="true" />
            <span>
              <strong>Agent prepares</strong>
              Finds stock or demand and prepares drafts.
            </span>
          </div>
          <div>
            <CheckCircleIcon weight="duotone" aria-hidden="true" />
            <span>
              <strong>People decide</strong>
              Nothing publishes without approval.
            </span>
          </div>
        </div>
      </section>

      <PilotNetwork />

      <details
        className="demo-sandbox"
        id="demo-sandbox"
        open={demoOpen}
        onToggle={(event) => setDemoOpen(event.currentTarget.open)}
      >
        <summary>
          <span className="sandbox-icon"><FlaskIcon weight="duotone" aria-hidden="true" /></span>
          <span className="sandbox-copy">
            <span>Illustrative data—not pilot evidence</span>
            <strong>Try the WebMCP agent without creating a real profile</strong>
            <small>
              This optional sandbox uses fictional stock and buyers so judges can
              test the agent tools without the private pilot code.
            </small>
          </span>
          <span className="sandbox-action">
            {demoOpen ? "Close sandbox" : "Open sandbox"}
            <CaretDownIcon weight="bold" aria-hidden="true" />
          </span>
        </summary>

        <div className="sandbox-controls">
          <span>Sandbox records never enter the live D1 pilot.</span>
          <button className="reset-button" type="button" onClick={() => marketStore.reset()}>
            <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
            Reset illustrative data
          </button>
        </div>

        <div className="workspace" id="workspace">
          <InventoryWorkspace
            inventory={state.inventory}
            selectedItemId={state.selectedItemId}
          />
          <AssistPanel state={state} />
        </div>

        <ActivityStrip activities={state.activities} />
      </details>

      <footer className="footer-cta">
        <div>
          <h2>Need to evaluate without joining the pilot?</h2>
          <p>
            Open the clearly labelled illustrative sandbox, then ask the agent to
            inspect inventory, find demand, and prepare a reviewable offer.
          </p>
        </div>
        <a className="footer-action" href="#demo-sandbox" onClick={() => setDemoOpen(true)}>
          Open agent sandbox
          <ArrowDownIcon weight="bold" aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}

export default App;
