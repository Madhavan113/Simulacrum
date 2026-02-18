import { runLiveSmoke } from "./live-smoke.js";
import { seedDemoData } from "./seed-demo.js";
import { isExecutedDirectly, logStep } from "./utils.js";

async function run(): Promise<void> {
  logStep("Running demo seed");
  const seed = await seedDemoData();
  console.log(JSON.stringify({ seed }, null, 2));

  logStep("Running live Hedera smoke");
  const smoke = await runLiveSmoke();
  console.log(JSON.stringify({ smoke }, null, 2));

  logStep("Hackathon infra demo completed");
}

if (isExecutedDirectly(import.meta.url)) {
  run().catch((error) => {
    console.error("[infra] Demo runner failed:", error);
    process.exitCode = 1;
  });
}
