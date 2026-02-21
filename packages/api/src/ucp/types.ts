export const UCP_VERSION = "2026-01-11";

export interface UcpServiceBinding {
  schema?: string;
  endpoint: string;
}

export interface UcpService {
  version: string;
  spec?: string;
  rest?: UcpServiceBinding;
  mcp?: UcpServiceBinding | null;
  a2a?: UcpServiceBinding | null;
}

export interface UcpCapability {
  name: string;
  version: string;
  spec?: string;
  schema?: string;
  extends?: string | null;
  config?: Record<string, unknown> | null;
}

export interface UcpPaymentHandlerConfig {
  network: string;
  merchant_account_id: string;
  supported_tokens: string[];
  accepts_pre_signed: boolean;
}

export interface UcpPaymentHandler {
  id: string;
  name: string;
  version: string;
  spec?: string;
  config_schema?: string;
  instrument_schemas?: string[];
  config: UcpPaymentHandlerConfig | Record<string, unknown>;
}

export interface UcpDiscoveryProfile {
  ucp: {
    version: string;
    services: Record<string, UcpService>;
    capabilities: UcpCapability[];
  };
  payment: {
    handlers: UcpPaymentHandler[];
  };
  signing_keys?: null;
}

export interface UcpEnvelope {
  ucp: {
    version: string;
    capabilities?: Array<{ name: string; version: string }>;
  };
}

export interface UcpCapabilityInvocation {
  capability: string;
  operation: string;
  params: Record<string, unknown>;
}

export interface UcpCapabilityResponse<T = unknown> extends UcpEnvelope {
  id: string;
  status: "ok" | "error";
  capability: string;
  operation: string;
  result?: T;
  error?: { code: string; message: string };
  idempotency_key?: string;
  timestamp: string;
}

export interface UcpPaymentInstrument {
  id: string;
  type: "hedera_hbar";
  signed_transaction_base64: string;
  network: string;
  payer_account_id: string;
}

export interface UcpPaymentResult {
  transaction_id: string;
  status: "SUCCESS" | "FAILED";
  network: string;
  explorer_url: string;
  amount_hbar: number;
}
