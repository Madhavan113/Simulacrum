import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createPlatformClient } from "./platform-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("platform client", () => {
  it("signs challenge login and sends bearer auth for market reads", async () => {
    const keypair = generateKeyPairSync("ed25519");
    const privateKeyPem = keypair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/agent/v1/auth/challenge")) {
        return jsonResponse({
          challengeId: "challenge-1",
          agentId: "agent-1",
          nonce: "nonce-1",
          message: "SIMULACRUM_AGENT_LOGIN\nchallengeId:challenge-1\nnonce:nonce-1\nagentId:agent-1\nexpiresAt:2099-01-01T00:00:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z"
        });
      }

      if (url.endsWith("/agent/v1/auth/verify")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          signature: string;
          agentId: string;
          challengeId: string;
        };
        const signature = Buffer.from(payload.signature, "base64");
        const message = "SIMULACRUM_AGENT_LOGIN\nchallengeId:challenge-1\nnonce:nonce-1\nagentId:agent-1\nexpiresAt:2099-01-01T00:00:00.000Z";
        const verified = verify(null, Buffer.from(message, "utf8"), keypair.publicKey, signature);

        if (!verified) {
          return jsonResponse({ error: "bad signature" }, 401);
        }

        return jsonResponse({
          tokenType: "Bearer",
          token: "token-1",
          agentId: "agent-1",
          walletAccountId: "0.0.8888",
          expiresAt: "2099-01-01T00:00:00.000Z"
        });
      }

      if (url.endsWith("/agent/v1/markets")) {
        const authorization = (init?.headers as Record<string, string>)?.authorization;

        if (authorization !== "Bearer token-1") {
          return jsonResponse({ error: "unauthorized" }, 401);
        }

        return jsonResponse({
          markets: [
            {
              id: "0.0.8080",
              question: "Will this pass?",
              creatorAccountId: "0.0.8888",
              closeTime: "2099-01-01T00:00:00.000Z",
              createdAt: "2099-01-01T00:00:00.000Z",
              status: "OPEN",
              outcomes: ["YES", "NO"]
            }
          ]
        });
      }

      return jsonResponse({ error: "not found" }, 404);
    });

    const client = createPlatformClient({
      baseUrl: "http://127.0.0.1:3001",
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const challenge = await client.requestChallenge("agent-1");
    const login = await client.verifyChallengeAndLogin({
      agentId: "agent-1",
      challengeId: challenge.challengeId,
      challengeMessage: challenge.message,
      authPrivateKey: privateKeyPem
    });
    const markets = await client.listMarkets();

    expect(login.token).toBe("token-1");
    expect(markets.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

