import type { ResearchPublication, EvalDimension, EvalTest, PublicationEvaluation } from "@simulacrum/types";

interface MarketStoreLike {
  markets: Map<string, unknown>;
}

function scoreReproducibility(
  publication: ResearchPublication,
  marketStore?: MarketStoreLike
): EvalDimension {
  const tests: EvalTest[] = [];
  let totalScore = 0;
  let testCount = 0;

  const allRefs = publication.findings.flatMap((f) => f.onChainRefs);

  if (allRefs.length === 0) {
    tests.push({
      name: "on-chain-references-exist",
      description: "Publication cites at least one on-chain reference",
      passed: false,
      score: 0,
      details: "No on-chain references found in any finding",
    });
    totalScore += 0;
    testCount += 1;
  } else {
    tests.push({
      name: "on-chain-references-exist",
      description: "Publication cites at least one on-chain reference",
      passed: true,
      score: 100,
      details: `${allRefs.length} on-chain references found`,
    });
    totalScore += 100;
    testCount += 1;
  }

  if (marketStore) {
    const marketRefs = allRefs.filter((r) => r.type === "market");
    let verified = 0;
    for (const ref of marketRefs) {
      if (marketStore.markets.has(ref.entityId)) {
        verified += 1;
      }
    }
    const refScore = marketRefs.length > 0 ? (verified / marketRefs.length) * 100 : 50;
    tests.push({
      name: "market-references-verified",
      description: "Referenced market IDs exist in the store",
      passed: verified === marketRefs.length,
      score: Math.round(refScore),
      details: `${verified}/${marketRefs.length} market references verified`,
    });
    totalScore += refScore;
    testCount += 1;
  }

  const { observationCount, marketIds } = publication.dataWindow;
  const dataTest = observationCount > 0 && marketIds.length > 0;
  tests.push({
    name: "data-window-populated",
    description: "Data window has observations and market references",
    passed: dataTest,
    score: dataTest ? 100 : 20,
    details: `${observationCount} observations across ${marketIds.length} markets`,
  });
  totalScore += dataTest ? 100 : 20;
  testCount += 1;

  const score = testCount > 0 ? Math.round(totalScore / testCount) : 0;

  return {
    score,
    rationale: `Reproducibility: ${tests.filter((t) => t.passed).length}/${tests.length} checks passed`,
    tests,
  };
}

function scoreStatisticalSignificance(publication: ResearchPublication): EvalDimension {
  const tests: EvalTest[] = [];
  let totalScore = 0;
  let testCount = 0;

  const obsCount = publication.dataWindow.observationCount;
  const findingsCount = publication.findings.length;

  const sampleSizeAdequate = obsCount >= 10;
  const sampleScore = sampleSizeAdequate ? Math.min(100, obsCount * 2) : Math.max(10, obsCount * 5);
  tests.push({
    name: "sample-size-adequate",
    description: "Observation count sufficient for claims made",
    passed: sampleSizeAdequate,
    score: Math.round(Math.min(100, sampleScore)),
    details: `${obsCount} observations for ${findingsCount} findings`,
  });
  totalScore += Math.min(100, sampleScore);
  testCount += 1;

  let calibrated = 0;
  for (const finding of publication.findings) {
    const refCount = finding.onChainRefs.length;
    if (finding.confidence <= 0.5 || refCount >= 1) {
      calibrated += 1;
    }
  }
  const calibrationScore = findingsCount > 0 ? (calibrated / findingsCount) * 100 : 50;
  tests.push({
    name: "confidence-calibration",
    description: "High-confidence claims backed by references",
    passed: calibrated === findingsCount,
    score: Math.round(calibrationScore),
    details: `${calibrated}/${findingsCount} findings properly calibrated`,
  });
  totalScore += calibrationScore;
  testCount += 1;

  const score = testCount > 0 ? Math.round(totalScore / testCount) : 0;
  return {
    score,
    rationale: `Statistical significance: ${tests.filter((t) => t.passed).length}/${tests.length} checks passed`,
    tests,
  };
}

function scoreEvidenceBacking(publication: ResearchPublication): EvalDimension {
  const tests: EvalTest[] = [];
  let totalScore = 0;
  let testCount = 0;

  const findings = publication.findings;
  if (findings.length === 0) {
    return {
      score: 0,
      rationale: "No findings to evaluate",
      tests: [{
        name: "findings-exist",
        description: "Publication has at least one finding",
        passed: false,
        score: 0,
        details: "No findings",
      }],
    };
  }

  let withRefs = 0;
  let totalRefs = 0;
  for (const f of findings) {
    totalRefs += f.onChainRefs.length;
    if (f.onChainRefs.length > 0) withRefs += 1;
  }

  const refCoverage = (withRefs / findings.length) * 100;
  tests.push({
    name: "findings-have-references",
    description: "Each finding cites on-chain evidence",
    passed: withRefs === findings.length,
    score: Math.round(refCoverage),
    details: `${withRefs}/${findings.length} findings have on-chain references`,
  });
  totalScore += refCoverage;
  testCount += 1;

  const avgRefsPerFinding = totalRefs / findings.length;
  const densityScore = Math.min(100, avgRefsPerFinding * 50);
  tests.push({
    name: "reference-density",
    description: "Sufficient reference density across findings",
    passed: avgRefsPerFinding >= 1,
    score: Math.round(densityScore),
    details: `Average ${avgRefsPerFinding.toFixed(1)} references per finding`,
  });
  totalScore += densityScore;
  testCount += 1;

  const hasEvidence = findings.filter((f) => f.evidence && f.evidence.length > 20).length;
  const evidenceScore = (hasEvidence / findings.length) * 100;
  tests.push({
    name: "evidence-descriptions",
    description: "Findings include substantive evidence descriptions",
    passed: hasEvidence === findings.length,
    score: Math.round(evidenceScore),
    details: `${hasEvidence}/${findings.length} findings have substantive evidence`,
  });
  totalScore += evidenceScore;
  testCount += 1;

  const score = testCount > 0 ? Math.round(totalScore / testCount) : 0;
  return {
    score,
    rationale: `Evidence backing: ${tests.filter((t) => t.passed).length}/${tests.length} checks passed`,
    tests,
  };
}

export function runDeterministicEval(
  publication: ResearchPublication,
  marketStore?: MarketStoreLike
): Partial<Record<keyof PublicationEvaluation["dimensions"], EvalDimension>> {
  return {
    reproducibility: scoreReproducibility(publication, marketStore),
    statisticalSignificance: scoreStatisticalSignificance(publication),
    evidenceBacking: scoreEvidenceBacking(publication),
  };
}
