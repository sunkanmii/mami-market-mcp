import { ArrowsLeftRight, Storefront } from "@phosphor-icons/react";

export function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Trader Network home">
      <span className="brand-mark" aria-hidden="true">
        <Storefront weight="fill" />
        <ArrowsLeftRight weight="bold" />
      </span>
      <span>
        <strong>Trader</strong>
        <span>Network</span>
      </span>
    </a>
  );
}
