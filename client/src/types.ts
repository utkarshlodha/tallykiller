export type JournalLine = {
  account: string
  kind: "personal" | "real" | "nominal"
  side: "debit" | "credit"
  amount: number
}

export type JournalEntry = {
  narration: string
  lines: JournalLine[]
}

export type ClassifyResult = {
  source: string
  entry: JournalEntry
  debitTotal: number
  creditTotal: number
  balanced: boolean
}
