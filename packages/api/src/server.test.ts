import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApiServer } from "./server.js";

const servers: Array<ReturnType<typeof createApiServer>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();

    if (server) {
      await server.stop().catch(() => {
        // Server may not have been started in a test.
      });
    }
  }
});

describe("api server", () => {
  it("responds on health and enforces auth when configured", async () => {
    const server = createApiServer({ apiKey: "secret" });
    servers.push(server);

    const unauthorized = await request(server.app).get("/health");
    expect(unauthorized.status).toBe(401);

    const authorized = await request(server.app)
      .get("/health")
      .set("x-api-key", "secret");

    expect(authorized.status).toBe(200);
    expect(authorized.body.ok).toBe(true);
  });

  it("creates agent and returns registry list", async () => {
    const server = createApiServer();
    servers.push(server);

    const created = await request(server.app).post("/agents").send({
      name: "API Agent",
      accountId: "0.0.9001",
      bankrollHbar: 42,
      strategy: "random"
    });

    expect(created.status).toBe(201);

    const listing = await request(server.app).get("/agents");
    expect(listing.status).toBe(200);
    expect(Array.isArray(listing.body.agents)).toBe(true);
    expect(listing.body.agents.length).toBe(1);
  });

  it("validates request payloads", async () => {
    const server = createApiServer();
    servers.push(server);

    const response = await request(server.app).post("/agents").send({
      accountId: "0.0.9001",
      bankrollHbar: 42
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request body");
  });

  it("blocks manual mutations when strict autonomy mode is enabled", async () => {
    const server = createApiServer({
      autonomy: {
        strictMutations: true
      }
    });
    servers.push(server);

    const marketsRead = await request(server.app).get("/markets");
    expect(marketsRead.status).toBe(200);

    const blockedMutation = await request(server.app).post("/agents").send({
      name: "Blocked Agent",
      accountId: "0.0.9002",
      bankrollHbar: 20
    });
    expect(blockedMutation.status).toBe(403);
    expect(blockedMutation.body.error).toMatch(/Strict autonomous mode/i);

    const autonomyAllowed = await request(server.app).post("/autonomy/run-now");
    expect(autonomyAllowed.status).toBe(200);

    const clawdbotsAllowed = await request(server.app).post("/clawdbots/run-now");
    expect(clawdbotsAllowed.status).toBe(200);
  });

  it("exposes clawdbot status endpoint", async () => {
    const server = createApiServer({
      clawdbots: {
        oracleMinReputationScore: 70,
        oracleMinVoters: 3
      }
    });
    servers.push(server);

    const response = await request(server.app).get("/clawdbots/status");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("enabled");
    expect(response.body).toHaveProperty("running");
    expect(response.body.oracleMinReputationScore).toBe(70);
    expect(response.body.oracleMinVoters).toBe(3);
    expect(response.body).toHaveProperty("trustedResolverCount");

    const bots = await request(server.app).get("/clawdbots/bots");
    expect(bots.status).toBe(200);
    expect(Array.isArray(bots.body.bots)).toBe(true);
  });

  it("exposes hosted-mode status and goals endpoints", async () => {
    const server = createApiServer({
      clawdbots: {
        hostedMode: true,
        maxActionsPerMinute: 5
      }
    });
    servers.push(server);

    const status = await request(server.app).get("/clawdbots/status");
    expect(status.status).toBe(200);
    expect(status.body.hostedMode).toBe(true);
    expect(status.body).toHaveProperty("activeHostedBots");
    expect(status.body).toHaveProperty("suspendedHostedBots");

    const goals = await request(server.app).get("/clawdbots/goals");
    expect(goals.status).toBe(200);
    expect(Array.isArray(goals.body.goals)).toBe(true);
  });

  it("keeps demo backdoor disabled by default", async () => {
    const server = createApiServer({
      clawdbots: {
        hostedMode: true
      }
    });
    servers.push(server);

    const response = await request(server.app).post("/clawdbots/demo/scripted-timeline");
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/disabled/i);
  });

  it("exposes self-attest, challenge, and oracle vote endpoints", async () => {
    const server = createApiServer();
    servers.push(server);

    const selfAttest = await request(server.app)
      .post("/markets/unknown-market/self-attest")
      .send({
        attestedByAccountId: "0.0.9001",
        proposedOutcome: "YES",
        reason: "signal"
      });
    expect(selfAttest.status).toBe(400);

    const challenge = await request(server.app)
      .post("/markets/unknown-market/challenge")
      .send({
        challengerAccountId: "0.0.9002",
        proposedOutcome: "NO",
        reason: "counter-signal"
      });
    expect(challenge.status).toBe(400);

    const vote = await request(server.app)
      .post("/markets/unknown-market/oracle-vote")
      .send({
        voterAccountId: "0.0.9003",
        outcome: "YES",
        confidence: 0.7
      });
    expect(vote.status).toBe(400);
  });
});
