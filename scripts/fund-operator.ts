/**
 * One-shot script to transfer HBAR from your personal account to the
 * operator/treasury account used by all Simulacrum subsystems.
 *
 * Usage:
 *   FUND_FROM_ID=0.0.7973937 \
 *   FUND_FROM_KEY=<your-private-key> \
 *   FUND_TO_ID=0.0.7974257 \
 *   FUND_AMOUNT_HBAR=2000 \
 *   npx tsx scripts/fund-operator.ts
 */
import { createHederaClient, getBalance, transferHbar } from "@simulacrum/core";

const fromId = process.env.FUND_FROM_ID;
const fromKey = process.env.FUND_FROM_KEY;
const toId = process.env.FUND_TO_ID ?? "0.0.7974257";
const amount = Number(process.env.FUND_AMOUNT_HBAR ?? "2000");

if (!fromId || !fromKey) {
  console.error("Required env vars: FUND_FROM_ID, FUND_FROM_KEY");
  console.error(
    "\nExample:\n" +
    "  FUND_FROM_ID=0.0.7973937 FUND_FROM_KEY=<key> npx tsx scripts/fund-operator.ts"
  );
  process.exit(1);
}

async function main() {
  const client = createHederaClient({
    network: "testnet",
    accountId: fromId,
    privateKey: fromKey,
  });

  console.log(`Checking sender ${fromId} balance...`);
  const senderBal = await getBalance(fromId!, { client });
  console.log(`  Sender:   ${senderBal.hbar.toFixed(2)} HBAR`);

  const recipientBal = await getBalance(toId, { client });
  console.log(`  Operator: ${recipientBal.hbar.toFixed(2)} HBAR`);

  if (senderBal.hbar < amount + 5) {
    console.error(`\nInsufficient balance. Need ${amount} + buffer, have ${senderBal.hbar.toFixed(2)}.`);
    process.exit(1);
  }

  console.log(`\nTransferring ${amount} HBAR from ${fromId} → ${toId}...`);
  const result = await transferHbar(fromId!, toId, amount, { client });
  console.log(`  Transaction: ${result.transactionId}`);
  console.log(`  HashScan:    ${result.transactionUrl}`);

  const newBal = await getBalance(toId, { client });
  console.log(`\nOperator new balance: ${newBal.hbar.toFixed(2)} HBAR`);

  client.close();
}

main().catch((err) => {
  console.error("Transfer failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
