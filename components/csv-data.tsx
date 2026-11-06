"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/button";
import { Tooltip } from "@/components/tooltip";
import { previewCsv, templateCsv, type CsvError } from "@/lib/csv-tree";

export function CsvData({ treeId, treeName }: { treeId: string; treeName: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([templateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "family-tree-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mt-12 flex flex-col gap-3">
      <h2 className="font-display text-3xl">Data</h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        Download a template, export this tree, or import a CSV. Import always creates a new tree and does not change this one.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button tooltip="Download a CSV with the columns and three example people" variant="secondary" onClick={downloadTemplate}>
          Download CSV template
        </Button>
        <Tooltip content="Download this tree as CSV">
          <a href={`/api/trees/${treeId}/csv`} className="inline-flex h-11 items-center rounded-full border border-border bg-surface px-5 text-sm">
            Export tree as CSV
          </a>
        </Tooltip>
        <Button tooltip="Choose a CSV to preview before creating a new tree" variant="secondary" onClick={() => input.current?.click()}>
          Import CSV
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="text/csv,.csv"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void file.text().then((text) => {
            const plan = previewCsv(text);
            setCsv(text);
            setErrors(plan.errors);
            setMessage(null);
            setSummary(plan.errors.length === 0 ? `${plan.people.length} people, ${plan.links.length} parent links, ${plan.unions.length} couples.` : null);
          });
        }}
      />
      {errors.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-danger">
          {errors.map((error, index) => (
            <li key={`${error.row}-${error.ref}-${index}`}>
              {error.row > 0 ? `Row ${error.row}` : "File"}
              {error.ref ? ` (${error.ref})` : ""}: {error.message}
            </li>
          ))}
        </ul>
      ) : null}
      {summary ? <p className="text-sm text-muted">{summary}</p> : null}
      {summary && csv ? (
        <Button
          tooltip="Create a new tree from this CSV"
          disabled={pending}
          onClick={() => {
            setPending(true);
            setMessage(null);
            void fetch("/api/trees/csv", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ csv, name: `${treeName} import` }),
            })
              .then((response) => response.json() as Promise<{ id?: string; error?: string }>)
              .then((result) => {
                if (!result.id) {
                  setMessage(result.error ?? "Could not import that file.");
                  return;
                }
                router.push(`/tree/${result.id}`);
              })
              .finally(() => setPending(false));
          }}
        >
          {pending ? "Importing" : "Create tree from this CSV"}
        </Button>
      ) : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </section>
  );
}
