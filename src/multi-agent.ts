// A supervisor agent groups the accounts, then calls three specialists as tools.
// The supervisor decides when each one is needed. The specialists do not see
// the user. This is the LangChain subagent pattern: wrap each agent with tool()
// and give those tools to the supervisor.
// https://docs.langchain.com/oss/javascript/langchain/multi-agent/subagents
//
// debit_credit   apply the golden rule for the account type
// ledger_group   ledger and group for each party or item, with confidence
// voucher        which voucher records the statement

import { createAgent, tool, toolStrategy } from "langchain";
import { z } from "zod";
import type { AccountGroup, CategoryRule } from "./ledgers.js";

const confidenceSchema = z
  .number()
  .min(0)
  .max(100)
  .describe("Confidence as a percentage from 0 to 100");

const accountSchema = z.object({
  account: z.string(),
  type: z.enum(["personal", "real", "nominal"]),
  confidence: confidenceSchema.describe(
    "Percentage sure this account type is correct",
  ),
});

const amountSchema = z.object({
  account: z.string(),
  amount: z.number().positive(),
});

const accountsResultSchema = z.object({
  accounts: z.array(accountSchema).min(2),
});

const sidesSchema = z.object({
  debit: z.array(amountSchema).min(1),
  credit: z.array(amountSchema).min(1),
});

const ledgerSchema = z.object({
  ledgers: z.array(
    z.object({
      ledger: z.string(),
      group: z.string(),
      ledgerConfidence: confidenceSchema,
      groupConfidence: confidenceSchema,
    }),
  ),
});

const voucherValues = [
  "Contra",
  "Payment",
  "Receipt",
  "Journal",
  "Purchase",
  "Sales",
  "Debit Note",
  "Credit Note",
  "Stock Journal",
  "Memorandum",
  "Purchase Order",
  "Sales Order",
  "Delivery Note",
  "Reversing Journal",
  "Receipt Note",
  "Physical Stock",
  "Payroll",
  "Attendance",
  "Job Work In Order",
  "Job Work Out Order",
  "Material In",
  "Material Out",
  "Rejections In",
  "Rejections Out",
] as const;

const voucherSchema = z.object({
  voucher: z.enum(voucherValues),
  confidence: confidenceSchema,
});

const categorySchema = z.object({
  ledger: z.string(),
  group: z.string(),
  ledgerConfidence: confidenceSchema,
  groupConfidence: confidenceSchema,
  source: z.enum(["ai", "rule"]),
});

const fieldConfidenceSchema = z.object({
  account: confidenceSchema,
  ledger: confidenceSchema,
  group: confidenceSchema,
  voucher: confidenceSchema,
});

export const entrySchema = z.object({
  statement: z.string(),
  accounts: accountsResultSchema.shape.accounts,
  debit: sidesSchema.shape.debit,
  credit: sidesSchema.shape.credit,
  categories: z.array(categorySchema),
  ledgers: z.array(
    z.object({
      ledger: z.string(),
      group: z.string(),
    }),
  ),
  voucher: voucherSchema.shape.voucher,
  voucherConfidence: confidenceSchema,
  confidence: fieldConfidenceSchema,
  band: z.enum(["auto", "review", "manual"]),
});

export type AccountingEntry = z.infer<typeof entrySchema>;
export type CategoryLine = z.infer<typeof categorySchema>;

const ACCOUNTS_PROMPT = `You name the accounts in one statement and group each one by type.
For each account, set confidence to a percentage from 0 to 100 for how sure you are about that type.
That percentage is required on every account.

Personal: a person, an institution, a bank, capital, or drawings.
Real: an item or property, including cash.
Nominal: income, expense, purchase, or sale.

Do not invent an account for the business name.
A bank is personal, not real.
Include cash only when cash actually moves.
A cheque moves the bank, not cash.`;

const SIDES_PROMPT = `You mark each account debit or credit. You are given the account types. Apply only the rule for that type.

Personal. The receiver is debit. The giver is credit.
Real. What comes in is debit. What goes out is credit.
Nominal. An expense or loss is debit. Income or a gain is credit.

Give every line its own amount in rupees. When several assets are bought together, each keeps its own amount and the paying account is the total.
Use the amount written in the statement. Debit amounts must equal credit amounts.`;

const LEDGER_PROMPT = `You map each party and item in the statement to one ledger and one account group.
Return one mapping for every account that needs a book entry.
Set ledgerConfidence and groupConfidence from 0 to 100.

Groups come from the query. Use one of those names exactly. Do not invent a group.
Prefer a child group when it fits. Use a parent group only when no child fits.

Typical choices:
Customer who owes us → Sundry Debtors
Supplier we owe → Sundry Creditors
Cash → Cash-in-Hand
Bank → Bank Accounts
Stock for resale → Stock-in-Hand
Asset for use → Fixed Assets
Rent, salary, and similar costs → Indirect Expenses
Sale of goods or services → Sales Account
Purchase of goods for resale → Purchase Account
Owner's capital → Capital Account

If a saved rule matches a name, copy that ledger and group exactly.
If a ledger already exists, reuse that exact name. Do not invent another spelling.
Do not return a system ledger.
Do not create a ledger for the business name.`;

const VOUCHER_PROMPT = `You pick the one voucher for the statement.
Set confidence from 0 to 100 for how sure you are about the voucher.

main vouchers:(most entries are one of these)
Contra: money only moves between cash and a bank. Depositing cash into a bank, or withdrawing office cash from a bank, is Contra.
Receipt: money comes into the business. Capital brought in cash, or cash received from a customer, is Receipt.
Payment: money leaves by cash or by cheque. A cash purchase of an asset, cash paid for an expense, cash paid to a supplier, rent paid by cheque, and money withdrawn for personal use are Payment.
Journal: nothing is paid now. A credit purchase of an asset, or a bill received from a supplier, is Journal.
Purchase: goods are bought to be resold.
Sales: goods or services are sold.

secondary vouchers:

Debit Note: goods purchased earlier are returned to the supplier.
Credit Note: goods sold earlier are returned by the customer.
Stock Journal: goods move from one godown to another. There is no purchase and no sale.
Memorandum: a temporary entry kept as a reminder. It does not affect the regular books.
Purchase Order: an order placed with a supplier, listing the item, quantity, and rate. It is not the purchase.
Sales Order: an order received from a customer. It is not the sale.
Delivery Note: goods are delivered to the customer after a sales order.
Reversing Journal: the entry should affect the books only until a given date, and then reverse.
Receipt Note: goods are received from a supplier after a purchase order.
Physical Stock: the quantity counted in the godown is recorded against the quantity in the books.
Payroll: employee salary, earnings, deductions, or another payroll payment.
Attendance: an employee is present, absent, on paid leave, on unpaid leave, or working overtime. This is not the salary payment.
Job Work In Order: a customer orders the business to process the customer's own material. It is the order, not the movement of material.
Job Work Out Order: the business orders a job worker to process the business's own material. It is the order, not the movement of material.
Material In: material actually comes in. The customer's material arrives for job work, or processed goods come back from the job worker.
Material Out: material actually goes out. The business sends material to a job worker, or returns the finished goods to the customer after job work.
Rejections In: rejected goods are received back into the godown.
Rejections Out: rejected goods are sent out of the godown.

An asset bought for use is not a Purchase voucher. Paid now, it is Payment. Taken on credit, it is Journal.
An order, a delivery, a goods receipt, a godown transfer, a stock count, a reminder, a reversing adjustment, attendance, a payroll calculation, job work, material movement, or a rejection is not Purchase, Sales, Payment, or Journal.`;

function modelId() {
  const name = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return name.includes(":") ? name : `openai:${name}`;
}

const model = modelId();

const sidesAgent = createAgent({
  model,
  name: "debit_credit",
  systemPrompt: SIDES_PROMPT,
  responseFormat: toolStrategy(sidesSchema),
});

const ledgerAgent = createAgent({
  model,
  name: "ledger_group",
  systemPrompt: LEDGER_PROMPT,
  responseFormat: toolStrategy(ledgerSchema),
});

const voucherAgent = createAgent({
  model,
  name: "voucher",
  systemPrompt: VOUCHER_PROMPT,
  responseFormat: toolStrategy(voucherSchema),
});

const querySchema = z.object({
  query: z.string().describe("The statement and the facts this specialist needs"),
});

const callDebitCredit = tool(
  async ({ query }) => {
    const result = await sidesAgent.invoke({
      messages: [{ role: "user", content: query }],
    });
    const parsed = sidesSchema.safeParse(result.structuredResponse);
    if (!parsed.success) {
      throw new Error("debit_credit did not return debit and credit lines.");
    }
    return JSON.stringify(parsed.data);
  },
  {
    name: "debit_credit",
    description:
      "Mark each grouped account debit or credit, with its amount. Call this after you have grouped the accounts. Call it again if the debit and credit totals are not equal.",
    schema: querySchema,
  },
);

const callLedgerGroup = tool(
  async ({ query }) => {
    const result = await ledgerAgent.invoke({
      messages: [{ role: "user", content: query }],
    });
    const parsed = ledgerSchema.safeParse(result.structuredResponse);
    if (!parsed.success) {
      throw new Error("ledger_group did not return a ledger list.");
    }
    return JSON.stringify(parsed.data);
  },
  {
    name: "ledger_group",
    description:
      "Map every party and item to a ledger and account group, with confidence scores. Call this after the debit and credit lines are known. Pass existing ledgers and any saved rules. Copy a ruled name exactly.",
    schema: querySchema,
  },
);

const callVoucher = tool(
  async ({ query }) => {
    const result = await voucherAgent.invoke({
      messages: [{ role: "user", content: query }],
    });
    const parsed = voucherSchema.safeParse(result.structuredResponse);
    if (!parsed.success) {
      throw new Error("voucher did not return one voucher.");
    }
    return JSON.stringify(parsed.data);
  },
  {
    name: "voucher",
    description:
      "Pick the one voucher for the statement, with a confidence score. Call this after the accounts and the debit and credit lines are known.",
    schema: querySchema,
  },
);

const SUPERVISOR_PROMPT = `${ACCOUNTS_PROMPT}

You are the supervisor. You group the accounts yourself.
Set each account confidence to your percentage, from 0 to 100, for that account type.
Then you call the specialists, and you copy their JSON. Do not invent a side, a group, or a voucher.

1. Call debit_credit. Pass the statement and the grouped accounts.
2. Call ledger_group. Pass the statement, the grouped accounts, the debit and credit lines, every ledger that already exists in the books, and every saved rule. Those existing names and rules must be taken from the user message. Copy a ruled ledger and group exactly.
3. Call voucher. Pass the statement, the grouped accounts, and the debit and credit lines.

If the debit total and the credit total are not equal, call debit_credit again before you finish.
The final answer includes every account with its confidence percentage, and the debit, credit, ledgers, and voucher returned by the tools.`;

const supervisorResponseSchema = z.object({
  statement: z.string(),
  accounts: accountsResultSchema.shape.accounts,
  debit: sidesSchema.shape.debit,
  credit: sidesSchema.shape.credit,
  ledgers: ledgerSchema.shape.ledgers,
  voucher: voucherSchema.shape.voucher,
  voucherConfidence: confidenceSchema.optional(),
});

const supervisor = createAgent({
  model,
  name: "supervisor",
  tools: [callDebitCredit, callLedgerGroup, callVoucher],
  systemPrompt: SUPERVISOR_PROMPT,
  responseFormat: toolStrategy(supervisorResponseSchema),
});

function canonicalGroup(group: string, groups: AccountGroup[]) {
  const match = groups.find((item) => sameName(item.name, group));
  return match?.name ?? group.trim();
}

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function rounded(amount: number) {
  return Math.round(amount * 100) / 100;
}

function scoreOrZero(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function confidenceBand(
  confidence: number,
): AccountingEntry["band"] {
  if (confidence >= 90) return "auto";
  if (confidence >= 80) return "review";
  return "manual";
}

function lowest(values: number[]) {
  return values.length === 0 ? 0 : Math.min(...values);
}

export function fieldConfidence(input: {
  accounts: { confidence: number }[];
  categories: { ledgerConfidence: number; groupConfidence: number }[];
  voucherConfidence: number;
}) {
  const confidence = {
    account: lowest(input.accounts.map((account) => account.confidence)),
    ledger: lowest(input.categories.map((line) => line.ledgerConfidence)),
    group: lowest(input.categories.map((line) => line.groupConfidence)),
    voucher: input.voucherConfidence,
  };
  const score = lowest([
    confidence.account,
    confidence.ledger,
    confidence.group,
    confidence.voucher,
  ]);
  return { confidence, score, band: confidenceBand(score) };
}

type AgentMessage = {
  getType?: () => string;
  name?: string;
  content?: unknown;
  tool_calls?: { id?: string; name?: string }[];
  tool_call_id?: string;
};

function lastToolPayload(messages: readonly AgentMessage[], toolName: string) {
  const callNames = new Map<string, string>();
  let payload: unknown;

  for (const message of messages) {
    const type = message.getType?.();
    if (type === "ai") {
      for (const call of message.tool_calls ?? []) {
        if (call.id && call.name) callNames.set(call.id, call.name);
      }
    }
    if (type !== "tool" || !message.tool_call_id) continue;
    const name = message.name || callNames.get(message.tool_call_id);
    if (name !== toolName || typeof message.content !== "string") continue;
    payload = JSON.parse(message.content);
  }

  return payload;
}

function applyCategoryRules(
  categories: CategoryLine[],
  rules: CategoryRule[],
  groups: AccountGroup[],
): CategoryLine[] {
  return categories.map((line) => {
    const rule = rules.find((item) => sameName(item.matchName, line.ledger));
    if (!rule) return line;
    return {
      ledger: rule.ledgerName.trim(),
      group: canonicalGroup(rule.group, groups),
      ledgerConfidence: 100,
      groupConfidence: 100,
      source: "rule",
    };
  });
}

function applyAccountRules(
  accounts: AccountingEntry["accounts"],
  rules: CategoryRule[],
): AccountingEntry["accounts"] {
  return accounts.map((account) => {
    const rule = rules.find((item) => sameName(item.matchName, account.account));
    if (!rule) return account;
    return {
      account: account.account,
      type: rule.accountType,
      confidence: 100,
    };
  });
}

function matchedRuleVoucher(rules: CategoryRule[], categories: CategoryLine[]) {
  for (const line of categories) {
    const rule = rules.find((item) => sameName(item.matchName, line.ledger));
    if (rule) return rule.voucher;
  }
  return null;
}

function groupLines(groups: AccountGroup[]) {
  if (groups.length === 0) return ["- (none)"];
  return groups.map((group) =>
    group.parent ? `- ${group.name} (under ${group.parent})` : `- ${group.name}`,
  );
}

export async function classifyStatement(
  statement: string,
  existingLedgers: string[],
  rules: CategoryRule[] = [],
  groups: AccountGroup[] = [],
  systemLedgers: string[] = [],
): Promise<AccountingEntry> {
  const result = await supervisor.invoke({
    messages: [
      {
        role: "user",
        content: [
          `Statement: ${statement}`,
          "",
          "Ledgers that already exist. Reuse these names. Do not create them again:",
          ...(existingLedgers.length === 0
            ? ["- (none)"]
            : existingLedgers.map((name) => `- ${name}`)),
          "",
          "System ledgers. Do not return these:",
          ...(systemLedgers.length === 0
            ? ["- (none)"]
            : systemLedgers.map((name) => `- ${name}`)),
          "",
          "Account groups. Use one of these names:",
          ...groupLines(groups),
          "",
          "Saved rules. Copy the account type, ledger, group, and voucher exactly for these names:",
          ...(rules.length === 0
            ? ["- (none)"]
            : rules.map(
                (rule) =>
                  `- ${rule.matchName} -> type ${rule.accountType}, ledger ${rule.ledgerName}, group ${rule.group}, voucher ${rule.voucher}`,
              )),
        ].join("\n"),
      },
    ],
  });

  const messages = (result.messages ?? []) as AgentMessage[];
  const sides = sidesSchema.safeParse(lastToolPayload(messages, "debit_credit"));
  const ledgerList = ledgerSchema.safeParse(lastToolPayload(messages, "ledger_group"));
  const voucher = voucherSchema.safeParse(lastToolPayload(messages, "voucher"));
  const grouped = z
    .object({
      accounts: z.array(accountSchema).min(2),
    })
    .safeParse(result.structuredResponse);

  if (!grouped.success) {
    throw new Error("The supervisor did not score the accounts.");
  }
  if (!sides.success) {
    throw new Error("The supervisor did not call debit_credit.");
  }
  if (!ledgerList.success) {
    throw new Error("The supervisor did not call ledger_group.");
  }
  if (!voucher.success) {
    throw new Error("The supervisor did not call voucher.");
  }

  const debit = sides.data.debit.map((line) => ({
    account: line.account.trim(),
    amount: rounded(line.amount),
  }));
  const credit = sides.data.credit.map((line) => ({
    account: line.account.trim(),
    amount: rounded(line.amount),
  }));
  const debitTotal = rounded(debit.reduce((sum, line) => sum + line.amount, 0));
  const creditTotal = rounded(credit.reduce((sum, line) => sum + line.amount, 0));
  if (debitTotal !== creditTotal) {
    throw new Error("Debit and credit totals are not equal.");
  }

  const aiAccounts = grouped.data.accounts.map((account) => ({
    account: account.account.trim(),
    type: account.type,
    confidence: account.confidence,
  }));

  const aiCategories: CategoryLine[] = ledgerList.data.ledgers
    .filter(
      (line) => !systemLedgers.some((name) => sameName(name, line.ledger)),
    )
    .map((line) => ({
      ledger: line.ledger.trim(),
      group: canonicalGroup(line.group, groups),
      ledgerConfidence: scoreOrZero(line.ledgerConfidence),
      groupConfidence: scoreOrZero(line.groupConfidence),
      source: "ai" as const,
    }));

  const categories = applyCategoryRules(aiCategories, rules, groups);
  const accounts = applyAccountRules(aiAccounts, rules);
  const ruledVoucher = matchedRuleVoucher(rules, categories);
  const ruledVoucherParsed = voucherSchema.shape.voucher.safeParse(ruledVoucher);
  const finalVoucher = ruledVoucherParsed.success
    ? ruledVoucherParsed.data
    : voucher.data.voucher;
  const voucherConfidence = ruledVoucherParsed.success
    ? 100
    : scoreOrZero(voucher.data.confidence);

  const keptLedgers = categories
    .filter(
      (line) =>
        !existingLedgers.some((name) => sameName(name, line.ledger)),
    )
    .map((line) => ({
      ledger: line.ledger,
      group: line.group,
    }));

  const scored = fieldConfidence({
    accounts,
    categories,
    voucherConfidence,
  });

  return {
    statement,
    accounts,
    debit,
    credit,
    categories,
    ledgers: keptLedgers,
    voucher: finalVoucher,
    voucherConfidence,
    confidence: scored.confidence,
    band: scored.band,
  };
}
