import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import { apiError } from "@/lib/api";
import { DOC_LABELS, downloadDocument, emailDocument } from "@/lib/documents";
import type { DocType } from "@/lib/types";

export interface DocSpec {
  type: DocType;
  label?: string;
}

/**
 * A compact "Documents" popover offering a Download (PDF) and an Email action
 * for each applicable document of a record. Dropped into the Sale / Purchase /
 * Manufacturing detail modals.
 */
export function DocumentActions({
  docs,
  recordId,
  recordName,
  defaultEmail,
}: {
  docs: DocSpec[];
  recordId: number;
  recordName: string;
  defaultEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DocType | null>(null);
  const [emailing, setEmailing] = useState<{ type: DocType; label: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const labelOf = (d: DocSpec) => d.label ?? DOC_LABELS[d.type];

  async function onDownload(type: DocType) {
    setBusy(type);
    try {
      await downloadDocument(type, recordId, recordName);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the document.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <FileText className="h-4 w-4" /> Documents <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-teal-100 bg-white p-1.5 shadow-xl shadow-teal-950/15">
          {docs.map((d) => (
            <div
              key={d.type}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-teal-50/70"
            >
              <span className="text-sm font-medium text-slate-700">{labelOf(d)}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDownload(d.type)}
                  disabled={busy === d.type}
                  title={`Download ${labelOf(d)} PDF`}
                  className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold text-slate-600 transition hover:bg-teal-100/70 hover:text-teal-800 disabled:opacity-50"
                >
                  {busy === d.type ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  PDF
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setEmailing({ type: d.type, label: labelOf(d) });
                  }}
                  title={`Email ${labelOf(d)}`}
                  className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold text-slate-600 transition hover:bg-teal-100/70 hover:text-teal-800"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {emailing && (
        <EmailDocumentModal
          docType={emailing.type}
          docLabel={emailing.label}
          recordId={recordId}
          recordName={recordName}
          defaultEmail={defaultEmail ?? ""}
          onClose={() => setEmailing(null)}
        />
      )}
    </div>
  );
}

function EmailDocumentModal({
  docType,
  docLabel,
  recordId,
  recordName,
  defaultEmail,
  onClose,
}: {
  docType: DocType;
  docLabel: string;
  recordId: number;
  recordName: string;
  defaultEmail: string;
  onClose: () => void;
}) {
  const [to, setTo] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!to.trim()) {
      toast.error("Enter a recipient email address.");
      return;
    }
    setSending(true);
    try {
      const res = await emailDocument(docType, recordId, {
        to: to.trim(),
        message: message.trim() || undefined,
      });
      if (res.sent) toast.success(`${docLabel} emailed to ${res.to}`);
      else toast.error(res.detail || "The document was not sent.");
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Email ${docLabel} · ${recordName}`}>
      <div className="space-y-4">
        <div>
          <Label>Recipient email</Label>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="customer@example.com"
            autoFocus
          />
        </div>
        <div>
          <Label>Message (optional)</Label>
          <Textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a short note to include in the email…"
          />
        </div>
        <p className="text-xs text-slate-500">
          The {docLabel} PDF will be attached and sent from your configured mailbox.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} loading={sending}>
            <Mail className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}
