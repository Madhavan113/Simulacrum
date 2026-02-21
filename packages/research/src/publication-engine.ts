import type {
  ResearchPublication,
  PublicationEvaluation,
  ObservationWindow,
} from "@simulacrum/types";
import type { XaiEngine } from "./xai-engine.js";
import type { DeepResearchAgent } from "./research-agent.js";
import { runDeterministicEval } from "./deterministic-eval.js";
import { mergeEvaluation } from "./evaluation.js";

const MAX_REVISION_CYCLES = 2;

export type PipelineAdvanceResult =
  | { advanced: true; stage: string; publication?: ResearchPublication }
  | { advanced: false; reason: string };

export async function advancePipeline(
  agent: DeepResearchAgent,
  windows: ObservationWindow[],
  xai: XaiEngine,
  evalThreshold: number,
  marketStoreAccessor?: () => { markets: Map<string, unknown> }
): Promise<PipelineAdvanceResult> {
  const pipeline = agent.pipeline;
  if (!pipeline) return { advanced: false, reason: "no active pipeline" };

  switch (pipeline.stage) {
    case "COLLECTING": {
      agent.advanceTo("ANALYZING");
      const analysis = await xai.analyzeObservations(
        windows,
        agent.profile.focusArea,
        agent.previousFindings
      );

      if (!analysis || analysis.patterns.length === 0) {
        agent.resetPipeline();
        return { advanced: false, reason: "no meaningful patterns found" };
      }

      agent.setAnalysis(analysis);
      return { advanced: true, stage: "ANALYZING" };
    }

    case "ANALYZING": {
      agent.advanceTo("HYPOTHESIZING");
      const hypotheses = await xai.generateHypotheses(
        agent.analysisResult!,
        agent.profile.focusArea,
        agent.previousPublicationTitles
      );

      if (!hypotheses || hypotheses.length === 0) {
        agent.resetPipeline();
        return { advanced: false, reason: "no hypotheses generated" };
      }

      agent.setHypotheses(hypotheses);
      return { advanced: true, stage: "HYPOTHESIZING" };
    }

    case "HYPOTHESIZING": {
      agent.advanceTo("DRAFTING");
      const draft = await xai.synthesizePublication(
        agent.hypotheses!,
        windows,
        agent.profile.focusArea
      );

      if (!draft?.title || !draft?.findings) {
        agent.resetPipeline();
        return { advanced: false, reason: "synthesis failed" };
      }

      const shell = agent.buildPublicationShell(windows);
      const merged: Partial<ResearchPublication> = {
        ...shell,
        ...draft,
        id: shell.id,
        agentId: shell.agentId,
        focusArea: shell.focusArea,
        dataWindow: shell.dataWindow,
        previousPublicationIds: shell.previousPublicationIds,
        status: "DRAFTING",
      };

      agent.setDraft(merged);
      return { advanced: true, stage: "DRAFTING" };
    }

    case "DRAFTING": {
      agent.advanceTo("REVIEWING");

      let review = await xai.selfReview(agent.draft!);
      if (!review) {
        console.warn("[publication-engine] Self-review returned null, retrying once...");
        review = await xai.selfReview(agent.draft!);
      }

      if (!review) {
        console.error("[publication-engine] Self-review failed after retry — blocking advancement");
        agent.resetPipeline();
        return { advanced: false, reason: "self-review failed after retry" };
      }

      if (review.score >= 70 || pipeline.revisionCount >= MAX_REVISION_CYCLES) {
        agent.advanceTo("EVALUATING");
        return { advanced: true, stage: "EVALUATING" };
      }

      const revised = await xai.revise(agent.draft!, review);
      if (revised) {
        agent.setDraft({
          ...agent.draft,
          ...revised,
          id: agent.draft!.id,
          agentId: agent.draft!.agentId,
          focusArea: agent.draft!.focusArea,
          dataWindow: agent.draft!.dataWindow,
        });
        agent.incrementRevision();
      } else {
        console.warn("[publication-engine] Revision failed — not consuming revision slot");
      }

      pipeline.reviewCritiques = review.critiques;
      return { advanced: true, stage: "REVIEWING" };
    }

    case "REVIEWING": {
      agent.advanceTo("EVALUATING");
      return { advanced: true, stage: "EVALUATING" };
    }

    case "EVALUATING": {
      const draft = agent.draft;
      if (
        !draft?.id ||
        !draft.agentId ||
        !draft.focusArea ||
        !draft.title ||
        !draft.dataWindow ||
        !Array.isArray(draft.findings)
      ) {
        agent.resetPipeline();
        return { advanced: false, reason: "incomplete draft — missing required fields" };
      }

      const publication: ResearchPublication = {
        id: draft.id,
        agentId: draft.agentId,
        focusArea: draft.focusArea,
        status: "EVALUATING",
        title: draft.title,
        abstract: draft.abstract ?? "",
        methodology: draft.methodology ?? "",
        findings: draft.findings,
        conclusion: draft.conclusion ?? "",
        limitations: draft.limitations ?? "",
        futureWork: draft.futureWork ?? "",
        dataWindow: draft.dataWindow,
        previousPublicationIds: draft.previousPublicationIds ?? [],
        createdAt: draft.createdAt ?? new Date().toISOString(),
      };

      const detEval = runDeterministicEval(
        publication,
        marketStoreAccessor?.()
      );

      const llmEval = await xai.scorePublication(publication, detEval);
      const evaluation = mergeEvaluation(publication.id, detEval, llmEval);

      publication.evaluation = evaluation;

      if (evaluation.overallScore >= evalThreshold) {
        publication.status = "PUBLISHED";
        publication.publishedAt = new Date().toISOString();
      } else if (evaluation.overallScore >= evalThreshold - 10 && pipeline.revisionCount < MAX_REVISION_CYCLES) {
        agent.setDraft(publication);
        agent.advanceTo("DRAFTING");
        agent.incrementRevision();
        return { advanced: true, stage: "DRAFTING" };
      } else {
        publication.status = "RETRACTED";
        publication.retractedAt = new Date().toISOString();
        publication.retractedReason = `Evaluation score ${evaluation.overallScore} below threshold ${evalThreshold}`;
      }

      agent.completePipeline(publication);
      return { advanced: true, stage: publication.status, publication };
    }

    default:
      return { advanced: false, reason: `terminal stage: ${pipeline.stage}` };
  }
}
