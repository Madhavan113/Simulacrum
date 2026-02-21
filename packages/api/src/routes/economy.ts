import { Router } from "express";
import { getMarketStore } from "@simulacrum/markets";
import { getServiceStore } from "@simulacrum/services";
import { getTaskStore } from "@simulacrum/tasks";
import { getInsuranceStore } from "@simulacrum/insurance";
import { getReputationStore, calculateReputationScore } from "@simulacrum/reputation";

import type { ApiEventBus } from "../events.js";

export function createEconomyRouter(eventBus: ApiEventBus): Router {
  const router = Router();

  router.get("/overview", (_request, response) => {
    const marketStore = getMarketStore();
    const serviceStore = getServiceStore();
    const taskStore = getTaskStore();
    const insuranceStore = getInsuranceStore();

    const markets = Array.from(marketStore.markets.values());
    const services = Array.from(serviceStore.services.values());
    const tasks = Array.from(taskStore.tasks.values());
    const serviceRequests = Array.from(serviceStore.requests.values());

    // Collect unique agent account IDs across all systems
    const agentIds = new Set<string>();
    for (const m of markets) agentIds.add(m.creatorAccountId);
    for (const s of services) agentIds.add(s.providerAccountId);
    for (const t of tasks) {
      agentIds.add(t.posterAccountId);
      if (t.assigneeAccountId) agentIds.add(t.assigneeAccountId);
    }
    for (const r of serviceRequests) {
      agentIds.add(r.requesterAccountId);
      agentIds.add(r.providerAccountId);
    }

    response.json({
      overview: {
        totalAgents: agentIds.size,
        markets: {
          total: markets.length,
          open: markets.filter((m) => m.status === "OPEN").length,
          resolved: markets.filter((m) => m.status === "RESOLVED").length,
          disputed: markets.filter((m) => m.status === "DISPUTED").length
        },
        services: {
          total: services.length,
          active: services.filter((s) => s.status === "ACTIVE").length,
          totalRequests: serviceRequests.length,
          completed: serviceRequests.filter((r) => r.status === "COMPLETED").length,
          pending: serviceRequests.filter((r) => r.status === "PENDING").length
        },
        tasks: {
          total: tasks.length,
          open: tasks.filter((t) => t.status === "OPEN").length,
          assigned: tasks.filter((t) => t.status === "ASSIGNED" || t.status === "IN_PROGRESS").length,
          completed: tasks.filter((t) => t.status === "COMPLETED").length,
          disputed: tasks.filter((t) => t.status === "DISPUTED").length
        },
        insurance: {
          totalPolicies: insuranceStore.policies.size,
          totalPools: insuranceStore.pools.size
        }
      }
    });
  });

  router.get("/metrics", (_request, response) => {
    const marketStore = getMarketStore();
    const serviceStore = getServiceStore();
    const taskStore = getTaskStore();

    // Calculate total HBAR volume across all systems
    let marketVolume = 0;
    for (const bets of marketStore.bets.values()) {
      for (const bet of bets) {
        marketVolume += bet.amountHbar;
      }
    }

    let serviceVolume = 0;
    for (const req of serviceStore.requests.values()) {
      if (req.status === "COMPLETED") {
        serviceVolume += req.priceHbar;
      }
    }

    let taskVolume = 0;
    for (const task of taskStore.tasks.values()) {
      if (task.status === "COMPLETED") {
        taskVolume += task.bountyHbar;
      }
    }

    const totalVolume = marketVolume + serviceVolume + taskVolume;

    // Transaction counts
    let totalBets = 0;
    for (const bets of marketStore.bets.values()) {
      totalBets += bets.length;
    }

    const totalServiceRequests = serviceStore.requests.size;

    let totalBids = 0;
    for (const bids of taskStore.bids.values()) {
      totalBids += bids.length;
    }

    const totalTransactions = totalBets + totalServiceRequests + totalBids;

    response.json({
      metrics: {
        gdpHbar: Number(totalVolume.toFixed(6)),
        volumeByType: {
          markets: Number(marketVolume.toFixed(6)),
          services: Number(serviceVolume.toFixed(6)),
          tasks: Number(taskVolume.toFixed(6))
        },
        transactionCounts: {
          total: totalTransactions,
          marketBets: totalBets,
          serviceRequests: totalServiceRequests,
          taskBids: totalBids
        }
      }
    });
  });

  router.get("/agents/:accountId", (request, response) => {
    const accountId = request.params.accountId;
    const marketStore = getMarketStore();
    const serviceStore = getServiceStore();
    const taskStore = getTaskStore();
    const repStore = getReputationStore();

    // Market positions
    const marketPositions: Array<{ marketId: string; totalStaked: number; betCount: number }> = [];
    for (const [marketId, bets] of marketStore.bets.entries()) {
      const agentBets = bets.filter((b) => b.bettorAccountId === accountId);
      if (agentBets.length > 0) {
        const totalStaked = agentBets.reduce((sum, b) => sum + b.amountHbar, 0);
        marketPositions.push({ marketId, totalStaked, betCount: agentBets.length });
      }
    }

    // Services provided
    const providedServices = Array.from(serviceStore.services.values()).filter(
      (s) => s.providerAccountId === accountId
    );

    // Service requests made
    const serviceRequestsMade = Array.from(serviceStore.requests.values()).filter(
      (r) => r.requesterAccountId === accountId
    );

    // Tasks posted
    const tasksPosted = Array.from(taskStore.tasks.values()).filter(
      (t) => t.posterAccountId === accountId
    );

    // Tasks assigned (working on)
    const tasksAssigned = Array.from(taskStore.tasks.values()).filter(
      (t) => t.assigneeAccountId === accountId
    );

    // Reputation
    const reputation = calculateReputationScore(accountId, repStore.attestations);

    response.json({
      agent: {
        accountId,
        reputation,
        portfolio: {
          marketPositions,
          providedServices: providedServices.map((s) => ({
            id: s.id,
            name: s.name,
            rating: s.rating,
            completedCount: s.completedCount
          })),
          serviceRequestsMade: serviceRequestsMade.length,
          tasksPosted: tasksPosted.length,
          tasksAssigned: tasksAssigned.length
        }
      }
    });
  });

  router.get("/leaderboard", (_request, response) => {
    const marketStore = getMarketStore();
    const serviceStore = getServiceStore();
    const taskStore = getTaskStore();
    const repStore = getReputationStore();

    // Collect all agents and their economic activity
    const agentActivity = new Map<string, { volume: number; transactions: number }>();

    const addActivity = (accountId: string, volume: number, txCount: number) => {
      const existing = agentActivity.get(accountId) ?? { volume: 0, transactions: 0 };
      existing.volume += volume;
      existing.transactions += txCount;
      agentActivity.set(accountId, existing);
    };

    for (const bets of marketStore.bets.values()) {
      for (const bet of bets) {
        addActivity(bet.bettorAccountId, bet.amountHbar, 1);
      }
    }

    for (const req of serviceStore.requests.values()) {
      addActivity(req.requesterAccountId, req.priceHbar, 1);
      if (req.status === "COMPLETED") {
        addActivity(req.providerAccountId, req.priceHbar, 1);
      }
    }

    for (const task of taskStore.tasks.values()) {
      if (task.status === "COMPLETED" && task.assigneeAccountId) {
        addActivity(task.assigneeAccountId, task.bountyHbar, 1);
        addActivity(task.posterAccountId, task.bountyHbar, 1);
      }
    }

    const leaderboard = Array.from(agentActivity.entries())
      .map(([accountId, activity]) => {
        const reputation = calculateReputationScore(accountId, repStore.attestations);
        return {
          accountId,
          volumeHbar: Number(activity.volume.toFixed(6)),
          transactions: activity.transactions,
          reputationScore: reputation.score
        };
      })
      .sort((a, b) => b.volumeHbar - a.volumeHbar)
      .slice(0, 50);

    response.json({ leaderboard });
  });

  router.get("/activity", (request, response) => {
    const rawLimit = Number(request.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;

    // Filter economy-related events
    const economyEventTypes = new Set([
      "market.created", "market.bet", "market.resolved", "market.claimed",
      "service.registered", "service.requested", "service.accepted",
      "service.completed", "service.disputed", "service.reviewed",
      "task.created", "task.bid", "task.assigned", "task.submitted",
      "task.completed", "task.disputed",
      "insurance.policy.created", "insurance.policy.claimed",
      "reputation.attested"
    ]);

    const allEvents = eventBus.recentEvents(500);
    const economyEvents = allEvents
      .filter((e) => economyEventTypes.has(e.type))
      .slice(-limit);

    response.json({ activity: economyEvents });
  });

  return router;
}
