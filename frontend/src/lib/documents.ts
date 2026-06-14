import axios from "axios";
import { api, apiError } from "./api";
import type { DocType } from "./types";

export const DOC_LABELS: Record<DocType, string> = {
  sale_order: "Sale Order",
  invoice: "Invoice",
  delivery_note: "Delivery Note",
  purchase_order: "Purchase Order",
  mo_traveler: "MO Traveler",
};

/** Error bodies for blob requests arrive as a Blob, so apiError can't read the
 * JSON detail — pull it out by hand, falling back to the generic extractor. */
async function blobErrorMessage(e: unknown, fallback: string): Promise<string> {
  if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
    try {
      const parsed = JSON.parse(await e.response.data.text());
      if (typeof parsed?.detail === "string") return parsed.detail;
    } catch {
      /* not JSON — fall through */
    }
  }
  return apiError(e, fallback);
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

/** Fetch a document PDF (auth header added by the axios interceptor — a plain
 * <a href> can't send the bearer token) and trigger a browser download. */
export async function downloadDocument(docType: DocType, id: number, recordName: string): Promise<void> {
  let res;
  try {
    res = await api.get(`/documents/${docType}/${id}`, { responseType: "blob" });
  } catch (e) {
    throw new Error(await blobErrorMessage(e, "Could not generate the document."));
  }
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(`${recordName}-${DOC_LABELS[docType]}`) || "document"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface EmailDocumentResult {
  sent: boolean;
  detail: string;
  to: string;
}

export async function emailDocument(
  docType: DocType,
  id: number,
  body: { to?: string; message?: string }
): Promise<EmailDocumentResult> {
  const res = await api.post<EmailDocumentResult>(`/documents/${docType}/${id}/email`, body);
  return res.data;
}
