import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { marketStore } from "./lib/store";

describe("Trader Network human-in-the-loop flow", () => {
  beforeEach(() => {
    marketStore.reset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prepares an offer but waits for the trader before publishing", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /preview that assist/i }));

    expect(screen.getByText("Agent-prepared draft")).toBeInTheDocument();
    expect(screen.getByText(/nothing is published until you approve/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve and publish/i })).toBeEnabled();
  });

  it("publishes only after an explicit approval action", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /preview that assist/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve and publish/i }));

    expect(screen.getByText(/are now reserved/i)).toBeInTheDocument();
    expect(screen.getByText(/your approval created the only committed change/i)).toBeInTheDocument();
  });
});
