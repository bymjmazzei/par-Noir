# Feeds and third-party monetization

**Status:** Policy source of truth for product and engineering.

## What par Noir does with feeds

Feeds are for **discovery, organization, collaboration, and the public index** (see layer model in repo rules). Users can **follow** feeds through normal product flows (e.g. subscribe in the sense of **following** a feed in the aggregator) without the platform acting as **merchant of record** for **paid access** to a feed.

## Creator paid feed tier (owner)

Database fields such as **`feeds.is_paid`**, **`monthly_price`**, and **`annual_price`**, and flows like **Coinbase `feed_creation`** after payment, refer to the **creator’s paid feed / ownership plan** (paying for or operating a feed tier on par Noir). They are **not** used to run **viewer → creator** “subscribe to this feed for money” checkout on the platform.

## What par Noir does not do

**par Noir does not host, process, or settle end-user paid subscriptions to feeds** (no recurring or term-based “pay here to unlock this feed” product run by par Noir). That avoids platform liability for **payments, refunds, chargebacks, tax characterization, and subscriber access disputes** for creator–subscriber relationships.

Creators who want subscription revenue should use **third-party** billing and access tools (e.g. Stripe Billing, Patreon, Memberful, Gumroad, their own site) and link or describe those offers outside this scope.

## Relationship to other economics

- **Creator fund / monetization maintenance** (`docs/business/CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md`) is a **separate** SKU and ledger. It is **not** feed subscription revenue.
- **Identity hierarchy** (human-rooted principals vs feed/business subjects): see `docs/developer/OWNED_ASSETS_AND_SUB_PN.md`.

## API behavior

Endpoints that previously created **platform** paid feed subscription checkouts return **`410 Gone`** (or equivalent) with error code `feed_platform_subscriptions_disabled`. Free **follow** / membership APIs that do not process subscriber payments remain unchanged.
