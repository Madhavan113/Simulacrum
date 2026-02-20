import { Router } from "express";
import { getResearchStore } from "@simulacrum/research";
import type { ResearchEngine } from "../research/engine.js";

export function createResearchRouter(engine: ResearchEngine): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json(engine.getStatus());
  });

  router.get("/publications", (req, res) => {
    const store = getResearchStore();
    let publications = Array.from(store.publications.values());

    const { status, focusArea, agentId } = req.query;
    if (typeof status === "string") {
      publications = publications.filter((p) => p.status === status);
    }
    if (typeof focusArea === "string") {
      publications = publications.filter((p) => p.focusArea === focusArea);
    }
    if (typeof agentId === "string") {
      publications = publications.filter((p) => p.agentId === agentId);
    }

    publications.sort((a, b) => {
      const da = a.publishedAt ?? a.createdAt;
      const db = b.publishedAt ?? b.createdAt;
      return db.localeCompare(da);
    });

    res.json({ publications });
  });

  router.get("/publications/:id", (req, res) => {
    const store = getResearchStore();
    const publication = store.publications.get(req.params.id);
    if (!publication) {
      res.status(404).json({ error: "Publication not found" });
      return;
    }

    const evaluation = publication.evaluation
      ? store.evaluations.get(publication.evaluation.id)
      : undefined;

    res.json({ publication, evaluation });
  });

  router.get("/observations", (req, res) => {
    const store = getResearchStore();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const total = store.observations.length;

    const endIndex = offset > 0 ? -offset : undefined;
    const startIndex = -(offset + limit);
    const observations = store.observations.slice(startIndex, endIndex);

    res.json({ observations, total });
  });

  router.get("/agents", (_req, res) => {
    const store = getResearchStore();
    const agents = Array.from(store.agentProfiles.values());
    res.json({ agents });
  });

  router.post("/start", async (_req, res) => {
    const status = engine.getStatus();
    if (!status.enabled) {
      res.status(409).json({ error: "Research engine is disabled. Set RESEARCH_ENABLED=true to enable." });
      return;
    }
    if (status.running) {
      res.json(status);
      return;
    }
    try {
      await engine.start();
      res.json(engine.getStatus());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to start" });
    }
  });

  router.post("/stop", async (_req, res) => {
    try {
      await engine.stop();
      res.json(engine.getStatus());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to stop" });
    }
  });

  router.post("/run-now", async (_req, res) => {
    const status = engine.getStatus();
    if (!status.enabled) {
      res.status(409).json({ error: "Research engine is disabled." });
      return;
    }
    try {
      await engine.runTick();
      res.json(engine.getStatus());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to run tick" });
    }
  });

  return router;
}
