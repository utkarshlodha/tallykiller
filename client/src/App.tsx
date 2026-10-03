import { useState, type FormEvent } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { ClassifyResult } from "@/types"

const EXAMPLE = "Mr. Verma purchased a computer in cash ₹ 18000"

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
})

function formatInr(amount: number) {
  return inr.format(amount)
}

export default function App() {
  const [text, setText] = useState("")
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [voucher, setVoucher] = useState<ClassifyResult | null>(null)
  const [history, setHistory] = useState<ClassifyResult[]>([])

  async function classify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const sentence = text.trim()
    setError("")

    if (!sentence) {
      setError("Write the transaction first.")
      return
    }

    setPending(true)
    setStatus("Selecting accounts...")

    try {
      const response = await fetch("/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: sentence }),
      })
      const payload = (await response.json()) as ClassifyResult & {
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error || "Classification failed.")
      }
      setHistory((current) => [payload, ...current])
      setVoucher(payload)
      setStatus("Accounts classified.")
    } catch (cause) {
      setStatus("")
      setError(
        cause instanceof Error ? cause.message : "Classification failed.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div id="daybook-page" className="min-h-svh bg-background">
      <header id="page-header" className="mx-auto w-full max-w-5xl px-4 pt-10">
        <p
          id="product-mark"
          className="text-sm font-medium tracking-wide text-muted-foreground"
        >
          Daybook
        </p>
        <h1 id="page-heading" className="mt-1 text-3xl font-semibold tracking-tight">
          Classify a statement
        </h1>
        <p id="page-subheading" className="mt-2 max-w-2xl text-muted-foreground">
          Write the statement. Each account comes back as personal, real, or
          nominal, and as debit or credit.
        </p>
      </header>
      <main
        id="page-main"
        className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 lg:grid-cols-2"
      >
        <section id="composer-section">
          <Card id="composer-card">
            <CardHeader id="composer-card-header">
              <CardDescription id="composer-card-description">
                One sentence. The server turns it into a journal voucher.
              </CardDescription>
            </CardHeader>
            <CardContent id="composer-card-content">
              <form id="classify-form" className="grid gap-4" onSubmit={classify}>
                <div id="transaction-field" className="grid gap-2">
                  <Label id="transaction-label" htmlFor="transaction-input">
                    Statement
                  </Label>
                  <Textarea
                    id="transaction-input"
                    name="text"
                    rows={6}
                    value={text}
                    placeholder="Mr. Verma purchased a computer in cash ₹ 18000"
                    onChange={(event) => setText(event.target.value)}
                  />
                </div>
                <div id="composer-actions" className="flex justify-end gap-2">
                  <Button
                    id="example-button"
                    type="button"
                    variant="outline"
                    onClick={() => setText(EXAMPLE)}
                  >
                    Try an example
                  </Button>
                  <Button id="classify-button" type="submit" disabled={pending}>
                    Classify
                  </Button>
                </div>
              </form>
              <p id="classify-status" className="mt-4 min-h-5 text-sm" role="status">
                {status}
              </p>
              {error ? (
                <Alert id="classify-error" variant="destructive" className="mt-2">
                  <AlertTitle id="classify-error-title">Could not classify</AlertTitle>
                  <AlertDescription id="classify-error-description">
                    {error}
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </section>
        <section id="result-section">
          {voucher ? (
            <Voucher result={voucher} />
          ) : (
            <Card id="voucher-empty">
              <CardHeader id="voucher-empty-header">
                <CardDescription id="voucher-empty-kicker">
                  Journal voucher
                </CardDescription>
                <CardTitle id="voucher-empty-title">No voucher yet</CardTitle>
              </CardHeader>
              <CardContent id="voucher-empty-content">
                <p id="voucher-empty-copy" className="text-muted-foreground">
                  Each account shows up here with its type, and the amount in
                  the debit column or the credit column.
                </p>
              </CardContent>
            </Card>
          )}
        </section>
        <section id="history-section" className="lg:col-span-2">
          <Card id="history-card">
            <CardHeader id="history-card-header">
              <CardTitle id="history-heading">This session</CardTitle>
              <CardDescription id="history-description">
                Earlier sentences from this visit. Reloading the page clears
                them.
              </CardDescription>
            </CardHeader>
            <CardContent id="history-card-content">
              {history.length === 0 ? (
                <p id="history-empty" className="text-sm text-muted-foreground">
                  Nothing classified yet.
                </p>
              ) : (
                <ol id="history-list" className="grid gap-2">
                  {history.map((result, index) => (
                    <li
                      id={`history-item-${index}`}
                      key={`${result.source}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <p id={`history-item-${index}-text`} className="text-sm">
                        {result.source}
                      </p>
                      <Button
                        id={`history-item-${index}-open`}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setVoucher(result)}
                      >
                        Show
                      </Button>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

function Voucher({ result }: { result: ClassifyResult }) {
  return (
    <Card id="voucher-section">
      <CardHeader id="voucher-header">
        <CardDescription id="voucher-kicker">Journal voucher</CardDescription>
        <CardTitle id="voucher-narration">{result.entry.narration}</CardTitle>
        <p id="voucher-source" className="text-sm text-muted-foreground">
          {result.source}
        </p>
      </CardHeader>
      <CardContent id="voucher-content" className="grid gap-4">
        <Table id="journal-table">
          <TableCaption id="journal-caption">Selected accounts</TableCaption>
          <TableHeader id="journal-head">
            <TableRow id="journal-head-row">
              <TableHead id="journal-head-account">Account</TableHead>
              <TableHead id="journal-head-kind">Type</TableHead>
              <TableHead id="journal-head-debit" className="text-right">
                Debit
              </TableHead>
              <TableHead id="journal-head-credit" className="text-right">
                Credit
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody id="journal-body">
            {result.entry.lines.map((line, index) => (
              <TableRow id={`journal-row-${index}`} key={`${line.account}-${index}`}>
                <TableCell id={`journal-row-${index}-account`}>
                  <span
                    id={`journal-row-${index}-name`}
                    className="font-medium"
                  >
                    {line.account}
                  </span>
                  <Badge
                    id={`journal-row-${index}-side`}
                    variant={line.side === "debit" ? "destructive" : "secondary"}
                    className="ml-2 capitalize"
                  >
                    {line.side}
                  </Badge>
                </TableCell>
                <TableCell id={`journal-row-${index}-kind`} className="capitalize">
                  {line.kind}
                </TableCell>
                <TableCell
                  id={`journal-row-${index}-debit`}
                  className="text-right tabular-nums"
                >
                  <span id={`journal-row-${index}-debit-amount`}>
                    {line.side === "debit" ? formatInr(line.amount) : "—"}
                  </span>
                </TableCell>
                <TableCell
                  id={`journal-row-${index}-credit`}
                  className="text-right tabular-nums"
                >
                  <span id={`journal-row-${index}-credit-amount`}>
                    {line.side === "credit" ? formatInr(line.amount) : "—"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter id="journal-foot">
            <TableRow id="journal-total-row">
              <TableCell id="journal-total-label">Total</TableCell>
              <TableCell id="journal-total-kind" />
              <TableCell
                id="journal-total-debit"
                className="text-right tabular-nums"
              >
                {formatInr(result.debitTotal)}
              </TableCell>
              <TableCell
                id="journal-total-credit"
                className="text-right tabular-nums"
              >
                {formatInr(result.creditTotal)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <p
          id="balance-status"
          data-balanced={String(result.balanced)}
          className={
            result.balanced
              ? "text-sm text-emerald-700"
              : "text-sm text-destructive"
          }
        >
          {result.balanced
            ? "Debits equal credits."
            : "Debits and credits do not match. Check the accounts before posting."}
        </p>
      </CardContent>
    </Card>
  )
}
