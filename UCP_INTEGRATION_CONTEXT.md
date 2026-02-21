# UCP + A2A Integration Context for Simulacrum

> **Last updated**: 2026-02-20
> **Sources**: [tutorial-ucp-hedera](https://github.com/hedera-dev/tutorial-ucp-hedera), [hedera-skills](https://github.com/hedera-dev/hedera-skills), [UCP blog post](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/)

---

## 1. What is UCP

The **Universal Commerce Protocol** is an open-source standard by Google (co-developed with Shopify, Stripe, Visa, Mastercard, Walmart, etc.) that defines a shared language for agentic commerce. It standardises:

- **Discovery** — `/.well-known/ucp` manifest declares services, capabilities, and payment handlers
- **Capabilities** — Modular commerce primitives (checkout, discount, fulfillment, order management)
- **Payment Handlers** — Pluggable payment processors (Google Pay, Shop Pay, **Hedera HBAR**)
- **Transport** — REST, MCP (Model Context Protocol), and **A2A (Agent-to-Agent)**
- **Security** — Tokenized payments, verifiable credentials, cryptographic consent proofs

### UCP Spec Version
`2026-01-11` — this is the current published version.

### Key Architectural Concepts

```
┌──────────────────┐       UCP Envelope        ┌──────────────────┐
│  Consumer Agent   │ ◄═══════════════════════► │  Business Server  │
│  (Gemini, AI Mode,│   REST / MCP / A2A        │  (Simulacrum API) │
│   custom agent)   │                           │                   │
└──────────────────┘                           └──────────────────┘
         │                                              │
         │  Payment Instrument                          │  Payment Handler
         │  (signed HBAR tx)                            │  (com.hedera.hbar)
         ▼                                              ▼
    ┌─────────┐                                  ┌─────────────┐
    │ Hedera   │ ◄══════ TransferTransaction ══► │ Hedera       │
    │ Network  │                                  │ Network      │
    └─────────┘                                  └─────────────┘
```

---

## 2. Reference Implementation: tutorial-ucp-hedera

**Repo**: https://github.com/hedera-dev/tutorial-ucp-hedera
**Stack**: Python 3.10+ / FastAPI / UCP Python SDK / Hiero SDK Python
**Structure**:

```
tutorial-ucp-hedera/
├── rest/
│   ├── setup.sh                          # One-command setup
│   ├── server/
│   │   ├── server.py                     # FastAPI entry point
│   │   ├── routes/
│   │   │   ├── discovery.py              # GET /.well-known/ucp
│   │   │   ├── discovery_profile.json    # UCP manifest template
│   │   │   └── ucp_implementation.py     # Route → business logic wiring
│   │   └── services/
│   │       ├── checkout_service.py       # Full checkout lifecycle
│   │       ├── hedera_service.py         # HBAR payment processing
│   │       └── fulfillment_service.py    # Shipping/fulfillment
│   ├── client/
│   │   └── flower_shop/
│   │       └── simple_happy_path_client.py  # End-to-end demo
│   └── test_data/flower_shop/            # Sample product CSVs
└── a2a/                                  # A2A transport (in progress)
```

### 2.1 Discovery Profile (Key Pattern)

The `discovery_profile.json` is the core manifest that declares what a business supports:

```json
{
  "ucp": {
    "version": "2026-01-11",
    "services": {
      "dev.ucp.shopping": {
        "version": "2026-01-11",
        "rest": {
          "endpoint": "{{ENDPOINT}}"
        }
      }
    },
    "capabilities": [
      { "name": "dev.ucp.shopping.checkout" },
      { "name": "dev.ucp.shopping.order" },
      { "name": "dev.ucp.shopping.discount", "extends": "dev.ucp.shopping.checkout" },
      { "name": "dev.ucp.shopping.fulfillment", "extends": "dev.ucp.shopping.checkout" },
      { "name": "dev.ucp.shopping.refund", "extends": "dev.ucp.shopping.order" },
      { "name": "dev.ucp.shopping.dispute", "extends": "dev.ucp.shopping.order" },
      { "name": "dev.ucp.shopping.return", "extends": "dev.ucp.shopping.order" },
      { "name": "dev.ucp.shopping.buyer_consent", "extends": "dev.ucp.shopping.checkout" }
    ]
  },
  "payment": {
    "handlers": [
      {
        "id": "hedera_payment",
        "name": "com.hedera.hbar",
        "version": "2026-01-11",
        "spec": "https://hedera.com/ucp/payment-handler",
        "config": {
          "network": "{{HEDERA_NETWORK}}",
          "merchant_account_id": "{{HEDERA_MERCHANT_ACCOUNT_ID}}",
          "supported_tokens": ["HBAR"],
          "accepts_pre_signed": true
        }
      }
    ]
  }
}
```

### 2.2 Hedera Payment Service (Non-Custodial)

From `services/hedera_service.py` — the key class `HederaPaymentService`:

**Flow:**
1. Client creates & signs `TransferTransaction` locally (customer → merchant HBAR)
2. Client base64-encodes the signed transaction bytes
3. Server receives the base64 payload in the UCP `complete_checkout` call
4. Server decodes, validates (amount, recipient), and submits to Hedera network
5. Server returns `transaction_id`, `status`, and HashScan `explorer_url`

```python
class HederaPaymentService:
    """Non-custodial Hedera payment processor."""

    def process_pre_signed_payment(
        self,
        signed_transaction_base64: str,
        expected_amount_hbar: float,
        checkout_id: str,
    ) -> dict[str, Any]:
        # 1. Decode base64 → transaction bytes
        tx_bytes = base64.b64decode(signed_transaction_base64)
        # 2. Parse transaction from bytes
        transaction = Transaction.from_bytes(tx_bytes)
        # 3. Submit to Hedera network
        receipt = transaction.execute(self.client)
        # 4. Return result with HashScan URL
        return {
            "transaction_id": str(receipt.transaction_id),
            "status": "SUCCESS",
            "network": self.network_name,
            "explorer_url": self._get_explorer_url(transaction_id),
        }
```

### 2.3 Client Happy Path (Discovery → Checkout → Payment)

From `simple_happy_path_client.py`:

1. **Discovery**: `GET /.well-known/ucp` → parse `com.hedera.hbar` handler → extract `merchant_account_id`
2. **Create checkout**: `POST /checkout-sessions` with line items + buyer info
3. **Update checkout**: `PUT /checkout-sessions/{id}` with discount codes, fulfillment address
4. **Create Hedera payment**: Build `TransferTransaction`, sign with customer key, encode to base64
5. **Complete checkout**: `POST /checkout-sessions/{id}/complete` with `payment_data` containing signed tx
6. **Verify**: Check order status, get HashScan URL

Key client function:
```python
def create_hedera_payment(customer_account_id, customer_private_key,
                          merchant_account_id, amount_hbar, checkout_id):
    transfer_tx = (
        TransferTransaction()
        .add_hbar_transfer(customer_acct, -amount_tinybars)
        .add_hbar_transfer(merchant_acct, amount_tinybars)
        .set_transaction_memo(f"UCP Checkout: {checkout_id}")
        .freeze_with(client)
        .sign(private_key)
    )
    return base64.b64encode(transfer_tx.to_bytes()).decode("utf-8")
```

---

## 3. Hedera Skills Marketplace

**Repo**: https://github.com/hedera-dev/hedera-skills
**Format**: Claude Code plugin marketplace (also compatible with `npx skills`)

### Available Plugins

| Plugin | Purpose | Key Files |
|--------|---------|-----------|
| **agent-kit-plugin** | Create custom Hedera Agent Kit plugins with tools for HTS, HCS, transfers | `SKILL.md`, `examples/simple-plugin/`, `examples/token-plugin/` |
| **hts-system-contract** | HTS system contract Solidity reference (API, structs, response codes, keys, fees) | `SKILL.md`, `references/api.md`, `references/structs.md` |
| **hackathon-helper** | PRD generator + submission validator aligned to ETH Denver judging criteria | `hackathon-prd/SKILL.md`, `validate-submission/SKILL.md` |

### Agent Kit Plugin Pattern

Plugins implement the `Plugin` interface:

```typescript
interface Plugin {
  name: string;
  version?: string;
  description?: string;
  tools: (context: Context) => Tool[];
}

interface Tool {
  method: string;           // snake_case identifier
  name: string;             // human-readable name
  description: string;      // LLM-friendly description
  parameters: z.ZodObject;  // Zod schema
  execute: (client: Client, context: Context, params: any) => Promise<any>;
}
```

Two tool types:
- **Mutation tools** — state-changing (token creation, transfers) → use `handleTransaction()`
- **Query tools** — read-only (balances, token info) → use direct service calls

### Marketplace Manifest

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "hedera-skills",
  "description": "Official Hedera marketplace for AI coding agent plugins",
  "plugins": [
    { "name": "agent-kit-plugin", "category": "development" },
    { "name": "hts-system-contract", "category": "development" },
    { "name": "hackathon-helper", "category": "workflow" }
  ]
}
```

---

## 4. Mapping UCP to Simulacrum

### 4.1 Capability Mapping

Simulacrum packages map to UCP capabilities as follows:

| UCP Capability (proposed) | Simulacrum Package | Operations |
|---|---|---|
| `dev.simulacrum.markets.predict` | `@simulacrum/markets` | `createMarket`, `placeBet`, `resolveMarket`, `claimWinnings` |
| `dev.simulacrum.markets.orderbook` | `@simulacrum/markets` | `publishOrder`, `cancelOrder`, `getOrderBook` |
| `dev.simulacrum.reputation.attest` | `@simulacrum/reputation` | `submitAttestation`, `calculateReputationScore`, `buildTrustGraph` |
| `dev.simulacrum.insurance.underwrite` | `@simulacrum/insurance` | `underwriteCommitment`, `processClaim`, `calculatePremium` |
| `dev.simulacrum.coordination.assurance` | `@simulacrum/coordination` | `createAssuranceContract`, `pledgeToAssurance`, `findSchellingPoint` |

### 4.2 Payment Handler: HBAR

Simulacrum already uses HBAR transfers via `@simulacrum/core/transfers.ts`. A UCP payment handler would wrap this:

```json
{
  "id": "simulacrum_hbar",
  "name": "com.hedera.hbar",
  "version": "2026-01-11",
  "config": {
    "network": "testnet",
    "merchant_account_id": "{escrow_account_id}",
    "supported_tokens": ["HBAR"],
    "accepts_pre_signed": true
  }
}
```

### 4.3 Discovery Endpoint

Simulacrum's API server (`packages/api/src/server.ts`) would expose:

```
GET /.well-known/ucp → Simulacrum discovery profile
```

Declaring:
- Services: `dev.simulacrum.markets`, `dev.simulacrum.reputation`, etc.
- Capabilities: per-package operations
- Payment handlers: HBAR via escrow accounts
- Transport: REST (existing), A2A (new), optionally MCP

### 4.4 Transport Mapping

| UCP Transport | Simulacrum Equivalent | Status |
|---|---|---|
| REST API | `packages/api/src/routes/agent-v1.ts` | Exists (JWT auth) |
| WebSocket | `packages/api/src/events.ts` | Exists (real-time events) |
| A2A | Agent-to-agent via ClawDBot network | Partial (needs UCP envelope) |
| MCP | Not yet implemented | New |

### 4.5 Auth Alignment

| UCP Concept | Simulacrum Implementation |
|---|---|
| Request signature | Ed25519 challenge-response (`agent-platform/auth.ts`) |
| Agent identity | JWT tokens (HMAC-SHA256) |
| Idempotency keys | Not yet implemented (UCP requires `idempotency-key` header) |
| Verifiable credentials | HCS attestations (`reputation/attestation.ts`) |

---

## 5. Integration Roadmap

### Phase 1: Discovery (Low effort, high signal)

- Add `GET /.well-known/ucp` route to API server
- Create `discovery_profile.json` template with Simulacrum capabilities
- Expose market, reputation, and coordination as UCP capabilities
- Register HBAR as a payment handler

### Phase 2: A2A Transport

- Implement UCP envelope format for agent-v1 routes
- Add idempotency-key header support
- Standardize request/response schemas to UCP format
- Enable external agents to discover and invoke market operations

### Phase 3: New Capability Verticals

- **Forecasting-as-a-Service** — agents query markets for probability estimates
- **Insurance-as-a-Service** — agents underwrite risk for other agents
- **Reputation-as-a-Service** — cross-platform trust scores via HCS attestations
- **Coordination-as-a-Service** — multi-agent collective action via assurance contracts

### Phase 4: Hedera Agent Kit Plugin

Using the `hedera-skills` pattern, create a Simulacrum plugin for Hedera Agent Kit:

```typescript
export const simulacrumPlugin: Plugin = {
  name: 'simulacrum-markets',
  version: '1.0.0',
  description: 'Prediction market operations via Simulacrum on Hedera',
  tools: (context: Context) => [
    createMarketTool(context),
    placeBetTool(context),
    resolveMarketTool(context),
    getMarketOddsTool(context),
  ],
};
```

---

## 6. Key Reference Code

### 6.1 UCP Python SDK

- **Repo**: https://github.com/Universal-Commerce-Protocol/python-sdk
- **Install**: `git clone ... && uv sync`
- **Models**: `ucp_sdk.models.discovery.profile_schema.UcpDiscoveryProfile`, `ucp_sdk.models.schemas.shopping.*`

### 6.2 Hiero SDK Python (Hedera)

- Used by the UCP tutorial for HBAR transfers
- Key classes: `TransferTransaction`, `AccountId`, `PrivateKey`, `Client`, `Network`
- Only supports **ECDSA** keys (not ED25519) for the UCP payment flow

### 6.3 UCP Specification Links

- Spec: https://ucp.dev/specs/shopping
- GitHub: https://github.com/Universal-Commerce-Protocol
- Checkout schema: https://ucp.dev/schemas/shopping/checkout.json
- OpenAPI: https://ucp.dev/services/shopping/openapi.json

### 6.4 Hedera Skills

- Repo: https://github.com/hedera-dev/hedera-skills
- Install: `/plugin marketplace add hedera-dev/hedera-skills` (Claude Code) or `npx skills add hedera-dev/hedera-skills`
- Agent Kit Plugin interface: `Plugin { name, version, description, tools: (ctx) => Tool[] }`
- Tool interface: `Tool { method, name, description, parameters (Zod), execute, outputParser? }`

---

## 7. Simulacrum Differentiators for UCP

| UCP Standard | Simulacrum Advantage |
|---|---|
| Cryptographic consent proofs | HCS provides immutable consensus-timestamped audit trail — stronger than signature-only |
| Payment handlers | Native HBAR transfers with sub-second finality (vs. traditional card processing) |
| Agent identity | Reputation-staked agents with trust graph — UCP has no built-in reputation |
| Dispute resolution | Oracle voting + self-attestation + challenge windows — UCP has basic dispute capability |
| Coordination | Assurance contracts + Schelling points for multi-agent collective action — unique to Simulacrum |
