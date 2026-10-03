// Reads and writes ledgers, account groups, and categorization rules in Supabase.
// The ledger agent gets existing names and rules so it does not create a ledger twice.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type NewLedger = {
  ledger: string;
  group: string;
};

export type AccountType = "personal" | "real" | "nominal";

export type CategoryRule = {
  matchName: string;
  ledgerName: string;
  group: string;
  accountType: AccountType;
  voucher: string;
};

export type StoredLedger = {
  name: string;
  system: boolean;
};

export type AccountGroup = {
  name: string;
  parent: string | null;
};

let client: SupabaseClient | undefined;

function supabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY are missing from .env",
    );
  }

  client = createClient(url, key);
  return client;
}

function sameName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export async function listLedgers(): Promise<StoredLedger[]> {
  const { data, error } = await supabase()
    .from("ledgers")
    .select("name, is_system")
    .order("name");

  if (error) {
    throw new Error(`Could not load ledgers from Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    name: String(row.name),
    system: Boolean(row.is_system),
  }));
}

export async function listAccountGroups(): Promise<AccountGroup[]> {
  const rows = await listAccountGroupsWithIds();
  return rows
    .map((row) => ({
      name: row.name,
      parent: rows.find((item) => item.id === row.parentId)?.name ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function listRules(): Promise<CategoryRule[]> {
  const [{ data, error }, groups] = await Promise.all([
    supabase()
      .from("rules")
      .select("match_name, ledger_name, group_id, account_type, voucher"),
    listAccountGroupsWithIds(),
  ]);

  if (error) {
    throw new Error(`Could not load rules from Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const group = groups.find((item) => item.id === Number(row.group_id));
    return {
      matchName: String(row.match_name).toLowerCase(),
      ledgerName: String(row.ledger_name),
      group: group?.name ?? "",
      accountType: row.account_type as AccountType,
      voucher: String(row.voucher),
    };
  });
}

async function listAccountGroupsWithIds(): Promise<
  { id: number; name: string; parentId: number | null }[]
> {
  const { data, error } = await supabase()
    .from("account_groups")
    .select("id, name, parent_id")
    .order("name");

  if (error) {
    throw new Error(`Could not load account groups: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
  }));
}

async function groupIdByName(group: string): Promise<number | null> {
  const { data, error } = await supabase()
    .from("account_groups")
    .select("id, name");

  if (error) {
    throw new Error(`Could not load account groups: ${error.message}`);
  }

  const match = (data ?? []).find((row) => sameName(row.name as string, group));
  return match ? Number(match.id) : null;
}

export async function resolveAccountGroup(group: string): Promise<string | null> {
  const groups = await listAccountGroups();
  const match = groups.find((item) => sameName(item.name, group));
  return match?.name ?? null;
}

export async function saveNewLedgers(ledgers: NewLedger[]): Promise<NewLedger[]> {
  if (ledgers.length === 0) return [];

  const existing = (await listLedgers()).map((ledger) => ledger.name);
  const created: NewLedger[] = [];

  for (const line of ledgers) {
    const name = line.ledger.trim();
    if (!name) continue;
    if (existing.some((known) => sameName(known, name))) continue;

    const groupId = await groupIdByName(line.group);
    if (groupId === null) {
      throw new Error(`Unknown account group: ${line.group}`);
    }

    const { error } = await supabase().from("ledgers").insert({
      name,
      group_id: groupId,
      is_system: false,
    });

    if (error) {
      if (error.code === "23505") continue;
      throw new Error(`Could not save ledger ${name}: ${error.message}`);
    }

    existing.push(name);
    created.push({ ledger: name, group: line.group });
  }

  return created;
}

export async function saveRule(
  matchName: string,
  ledgerName: string,
  group: string,
  accountType: AccountType,
  voucher: string,
): Promise<CategoryRule> {
  const groupId = await groupIdByName(group);
  if (groupId === null) {
    throw new Error(`Unknown account group: ${group}`);
  }

  const key = matchName.trim().toLowerCase();
  const ledger = ledgerName.trim();
  const type = accountType;
  const voucherName = voucher.trim();
  const { data: existing, error: findError } = await supabase()
    .from("rules")
    .select("id, match_name")
    .ilike("match_name", key);

  if (findError) {
    throw new Error(`Could not look up rule: ${findError.message}`);
  }

  const row = (existing ?? []).find((item) =>
    sameName(String(item.match_name), key),
  );

  if (row) {
    const { error } = await supabase()
      .from("rules")
      .update({
        ledger_name: ledger,
        group_id: groupId,
        account_type: type,
        voucher: voucherName,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Could not update rule for ${key}: ${error.message}`);
    }
  } else {
    const { error } = await supabase().from("rules").insert({
      match_name: key,
      ledger_name: ledger,
      group_id: groupId,
      account_type: type,
      voucher: voucherName,
    });

    if (error) {
      throw new Error(`Could not save rule for ${key}: ${error.message}`);
    }
  }

  return {
    matchName: key,
    ledgerName: ledger,
    group,
    accountType: type,
    voucher: voucherName,
  };
}

export async function applyGroupCorrection(
  ledgerName: string,
  group: string,
): Promise<void> {
  const groupId = await groupIdByName(group);
  if (groupId === null) {
    throw new Error(`Unknown account group: ${group}`);
  }

  const name = ledgerName.trim();
  const { data: existing, error: findError } = await supabase()
    .from("ledgers")
    .select("id, name");

  if (findError) {
    throw new Error(`Could not look up ledger ${name}: ${findError.message}`);
  }

  const row = (existing ?? []).find((item) => sameName(String(item.name), name));

  if (row) {
    const { error } = await supabase()
      .from("ledgers")
      .update({ group_id: groupId })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Could not update ledger ${name}: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase().from("ledgers").insert({
    name,
    group_id: groupId,
    is_system: false,
  });

  if (error && error.code !== "23505") {
    throw new Error(`Could not save ledger ${name}: ${error.message}`);
  }
}
