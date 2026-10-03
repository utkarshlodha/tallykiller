// Terminal. Run it with: npm run dev:cli
// Type a statement and press Enter. The reply is JSON from the multi-agent system.
// Type "exit" or press Ctrl-D to quit.
//
// One statement can also be passed on the command line after --.
//
// Ledgers, groups, and rules are loaded from Supabase before each statement.
// Confidence bands decide whether the result is accepted, reviewed, or
// entered manually. A rule is saved only when you change a group.

import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  applyGroupCorrection,
  listAccountGroups,
  listLedgers,
  listRules,
  resolveAccountGroup,
  saveNewLedgers,
  saveRule,
} from "./ledgers.js";
import {
  classifyStatement,
  fieldConfidence,
  type AccountingEntry,
  type CategoryLine,
} from "./multi-agent.js";

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function printEntry(entry: AccountingEntry) {
  output.write(`${JSON.stringify(entry, null, 2)}\n`);
}

function bandHint(band: AccountingEntry["band"]) {
  if (band === "auto") {
    return "Band auto (90-100). Accepted without review.";
  }
  if (band === "review") {
    return "Band review (80-89). Accept with y, or change a group as Ledger=Group.";
  }
  return [
    "Band manual (below 80). Type y to accept, or change a group as Ledger=Group.",
    "An empty answer is not accepted.",
  ].join("\n");
}

async function saveAccepted(entry: AccountingEntry) {
  const created = await saveNewLedgers(entry.ledgers);
  const accepted = { ...entry, ledgers: created };
  printEntry(accepted);
  return accepted;
}

async function applyManualGroup(
  entry: AccountingEntry,
  ledgerName: string,
  groupText: string,
): Promise<AccountingEntry> {
  const group = await resolveAccountGroup(groupText);
  if (!group) {
    throw new Error(`Unknown account group: ${groupText}`);
  }

  const category = entry.categories.find((line) =>
    sameName(line.ledger, ledgerName),
  );
  if (!category) {
    throw new Error(`Unknown ledger in this statement: ${ledgerName}`);
  }

  const ledger = category.ledger;
  const account = entry.accounts.find((line) => sameName(line.account, ledger));
  if (!account) {
    throw new Error(`Unknown account in this statement: ${ledger}`);
  }

  await applyGroupCorrection(ledger, group);
  await saveRule(ledger, ledger, group, account.type, entry.voucher);

  const categories: CategoryLine[] = entry.categories.map((line) =>
    sameName(line.ledger, ledger)
      ? {
          ledger,
          group,
          ledgerConfidence: 100,
          groupConfidence: 100,
          source: "rule",
        }
      : line,
  );
  const accounts = entry.accounts.map((line) =>
    sameName(line.account, ledger)
      ? { ...line, type: account.type, confidence: 100 }
      : line,
  );

  const remainingLedgers = entry.ledgers.filter(
    (line) => !sameName(line.ledger, ledger),
  );
  const created = await saveNewLedgers(remainingLedgers);
  const voucherConfidence = 100;
  const scored = fieldConfidence({
    accounts,
    categories,
    voucherConfidence,
  });

  return {
    ...entry,
    accounts,
    categories,
    ledgers: created,
    voucher: entry.voucher,
    voucherConfidence,
    confidence: scored.confidence,
    band: scored.band,
  };
}

async function reviewEntry(
  entry: AccountingEntry,
  ask: (prompt: string) => Promise<string>,
): Promise<AccountingEntry> {
  printEntry(entry);
  output.write(`${bandHint(entry.band)}\n`);

  if (entry.band === "auto") {
    return saveAccepted(entry);
  }

  while (true) {
    const answer = (await ask("review> ")).trim();
    if (answer === "" && entry.band === "manual") {
      output.write("An answer is required for this band.\n");
      continue;
    }
    if (answer === "" || answer.toLowerCase() === "y") {
      return saveAccepted(entry);
    }

    const separator = answer.indexOf("=");
    if (separator <= 0 || separator === answer.length - 1) {
      output.write("Use y to accept, or Ledger=Group to change a group.\n");
      continue;
    }

    const ledgerName = answer.slice(0, separator).trim();
    const groupText = answer.slice(separator + 1).trim();
    try {
      const corrected = await applyManualGroup(entry, ledgerName, groupText);
      printEntry(corrected);
      return corrected;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not apply the change";
      output.write(`${message}\n`);
    }
  }
}

async function classify(
  statement: string,
  ask: (prompt: string) => Promise<string>,
) {
  const [ledgers, rules, groups] = await Promise.all([
    listLedgers(),
    listRules(),
    listAccountGroups(),
  ]);
  const entry = await classifyStatement(
    statement,
    ledgers.map((ledger) => ledger.name),
    rules,
    groups,
    ledgers.filter((ledger) => ledger.system).map((ledger) => ledger.name),
  );
  await reviewEntry(entry, ask);
}

const statementArg = process.argv.slice(2).join(" ").trim();
const rl = readline.createInterface({ input, output });

async function ask(prompt: string) {
  return rl.question(prompt);
}

try {
  if (statementArg) {
    await classify(statementArg, ask);
  } else {
    while (true) {
      let line: string;
      try {
        line = await ask("> ");
      } catch {
        break;
      }

      const trimmed = line.trim();
      if (trimmed === "exit") break;
      if (trimmed === "") continue;

      try {
        await classify(trimmed, ask);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Classification failed";
        console.error(message);
      }
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Classification failed";
  console.error(message);
  process.exitCode = 1;
} finally {
  rl.close();
  if (!statementArg) output.write("\n");
}
