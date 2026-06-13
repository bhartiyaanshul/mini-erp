import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, Check, Bot, MessageCircle, ArrowUpRight, CheckCircle2, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { useAssistantChat, useAssistantExecute } from "@/lib/queries";
import { useAuth } from "@/auth/AuthContext";
import { apiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./ui";
import { canView } from "@/lib/access";
import type { ChatMessage, PendingAction, User } from "@/lib/types";

interface Turn {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  actions?: PendingAction[];
  tools?: string[];
}

const TOOL_LABELS: Record<string, string> = {
  list_products: "checked products",
  get_availability: "checked stock",
  dashboard_metrics: "read metrics",
  low_stock: "checked low stock",
  demand_forecast: "read forecast",
  list_sales_orders: "read sales orders",
  list_purchase_orders: "read purchase orders",
  list_manufacturing_orders: "read mfg orders",
  list_partners: "read partners",
  propose_sale_order: "drafted a sale order",
  propose_purchase_order: "drafted a purchase order",
  propose_manufacturing_order: "drafted a manufacturing order",
  propose_forecast_action: "drafted a replenishment",
};

function suggestionsFor(user: User): string[] {
  const s: string[] = [];
  if (canView(user, "sales")) s.push("Check what I can sell today");
  if (canView(user, "purchase")) s.push("Show urgent replenishment needs");
  if (canView(user, "manufacturing")) s.push("Show the most urgent build");
  if (canView(user, "product")) s.push("Show low stock items");
  if (user.is_system_admin) s.push("Give me a business health brief");
  if (s.length === 0) s.push("Give me a business health brief", "Show low stock items");
  return s.slice(0, 4);
}

let _id = 0;
const nextId = () => ++_id;

export function Copilot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({}); // confirmed/dismissed action keys
  const chat = useAssistantChat();
  const exec = useAssistantExecute();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTurn = turns[turns.length - 1];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, chat.isPending]);

  function send(text: string) {
    const q = text.trim();
    if (!q || chat.isPending) return;
    const userTurn: Turn = { id: nextId(), role: "user", content: q };
    const history: ChatMessage[] = [...turns, userTurn]
      .filter((t) => t.role === "user" || t.role === "assistant")
      .map((t) => ({ role: t.role as "user" | "assistant", content: t.content }));
    setTurns((t) => [...t, userTurn]);
    setInput("");
    chat.mutate(history, {
      onSuccess: (r) =>
        setTurns((t) => [...t, { id: nextId(), role: "assistant", content: r.reply, actions: r.pending_actions, tools: r.tool_trace }]),
      onError: (e) => setTurns((t) => [...t, { id: nextId(), role: "assistant", content: apiError(e, "Something went wrong.") }]),
    });
  }

  function confirm(turnId: number, idx: number, action: PendingAction) {
    const key = `${turnId}-${idx}`;
    exec.mutate(action, {
      onSuccess: (r) => {
        setDone((d) => ({ ...d, [key]: true }));
        setTurns((t) => [...t, { id: nextId(), role: "system", content: r.message }]);
        toast.success(r.message, { icon: <Sparkles className="h-4 w-4" /> });
      },
      onError: (e) => toast.error(apiError(e)),
    });
  }

  if (!user) return null;
  const suggestions = suggestionsFor(user);

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-2xl shadow-teal-950/25 ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-teal-950/35"
          title="Open operations assistant"
          aria-label="Open operations assistant"
        >
          <span className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.34),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.14),transparent_48%)]" />
          <span className="relative flex h-10 w-10 items-center justify-center">
            <AssistantMark className="h-9 w-9 transition-transform duration-200 group-hover:scale-105" />
          </span>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[660px] max-h-[88vh] w-[430px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-teal-100 bg-white/95 shadow-2xl shadow-teal-950/20">
          <header className="shrink-0 border-b border-teal-900/50 bg-slate-950 px-4 py-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 shadow-lg shadow-teal-950/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Operations Assistant</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      Live
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">Calm answers from your ERP data</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white"
                title="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <HeaderMetric icon={<MessageCircle className="h-3.5 w-3.5" />} label="Ask" />
              <HeaderMetric icon={<Clock3 className="h-3.5 w-3.5" />} label="Check" />
              <HeaderMetric icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Draft" />
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-teal-50 via-emerald-50/60 to-teal-50 p-4">
            {turns.length === 0 && (
              <div className="rounded-lg border border-teal-100 bg-white/80 p-4 shadow-sm shadow-teal-950/[0.03]">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-800">What should we look at first?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      I can check stock, explain what is blocking an order, or prepare a draft action for you to review.
                    </p>
                  </div>
                </div>
                <SuggestionButtons suggestions={suggestions} onPick={send} disabled={chat.isPending} />
              </div>
            )}

            {turns.map((t) => (
              <div key={t.id} className={cn("group", t.role === "user" ? "pl-8" : "pr-8")}>
                {t.role === "system" ? (
                  <p className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{t.content}</p>
                ) : (
                  <div className={cn("flex items-start gap-2", t.role === "user" ? "justify-end" : "justify-start")}>
                    {t.role === "assistant" && <AssistantAvatar />}
                    <div className={cn("max-w-[86%]", t.role === "user" && "text-right")}>
                      <p className={cn("mb-1 text-[11px] font-semibold", t.role === "user" ? "text-teal-700" : "text-slate-500")}>
                        {t.role === "user" ? "You" : "Assistant"}
                      </p>
                      <div
                        className={cn(
                          "rounded-lg px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                          t.role === "user"
                            ? "bg-teal-700 text-white shadow-teal-950/10"
                            : "border border-teal-100 bg-white/90 text-slate-700 shadow-teal-950/[0.03]"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{renderBold(t.content)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* tool trace */}
                {t.role === "assistant" && t.tools && t.tools.length > 0 && (
                  <div className="ml-8 mt-2 flex flex-wrap gap-1.5">
                    {[...new Set(t.tools)].map((name) => (
                      <span key={name} className="rounded-full border border-teal-100 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-slate-500">
                        {TOOL_LABELS[name] ?? name}
                      </span>
                    ))}
                  </div>
                )}

                {/* pending action cards */}
                {t.actions?.map((a, i) => {
                  const key = `${t.id}-${i}`;
                  const isDone = done[key];
                  return (
                    <div
                      key={key}
                      className={cn("ml-8 mt-2 rounded-lg border p-3 shadow-sm", isDone ? "border-emerald-200 bg-emerald-50" : "border-teal-200 bg-white/85")}
                    >
                      <p className="text-sm font-semibold text-slate-800">{a.preview.title}</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {a.preview.lines.map((l, j) => (
                          <li key={j}>• {l}</li>
                        ))}
                      </ul>
                      {a.preview.total != null && (
                        <p className="mt-1 text-xs font-semibold text-slate-700">Total: ₹{a.preview.total.toLocaleString("en-IN")}</p>
                      )}
                      {a.preview.note && <p className="mt-1 text-[11px] text-slate-500">{a.preview.note}</p>}
                      {!isDone ? (
                        <div className="mt-2.5 flex gap-2">
                          <Button size="sm" loading={exec.isPending} onClick={() => confirm(t.id, i, a)}>
                            <Check className="h-3.5 w-3.5" /> Confirm
                          </Button>
                          <Button size="sm" variant="outline" disabled={exec.isPending} onClick={() => setDone((d) => ({ ...d, [key]: true }))}>
                            Dismiss
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs font-medium text-emerald-600">Done</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {chat.isPending && (
              <div className="flex items-start gap-2">
                <AssistantAvatar />
                <div className="rounded-lg border border-teal-100 bg-white/90 px-3.5 py-3 shadow-sm shadow-teal-950/[0.03]">
                  <p className="mb-2 text-[11px] font-semibold text-slate-500">Assistant is checking</p>
                  <ThinkingDots />
                </div>
              </div>
            )}

            {turns.length > 0 && lastTurn?.role === "assistant" && !chat.isPending && (
              <SuggestionButtons suggestions={suggestions} onPick={send} disabled={chat.isPending} compact />
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="shrink-0 border-t border-teal-100 bg-white/95 p-3"
          >
            <div className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50/50 p-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about stock, orders, or risk..."
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || chat.isPending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800 disabled:pointer-events-none disabled:opacity-45"
                title="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">I’ll verify live data before answering or drafting anything.</p>
          </form>
        </div>
      )}
    </>
  );
}

function AssistantMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className} fill="none">
      <path
        d="M24 7.5c1.85 7.7 4.8 10.65 12.5 12.5-7.7 1.85-10.65 4.8-12.5 12.5-1.85-7.7-4.8-10.65-12.5-12.5C19.2 18.15 22.15 15.2 24 7.5Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M36.5 6.5c.7 3 1.95 4.25 4.95 4.95-3 .7-4.25 1.95-4.95 4.95-.7-3-1.95-4.25-4.95-4.95 3-.7 4.25-1.95 4.95-4.95ZM12.5 31.5c.55 2.35 1.5 3.3 3.85 3.85-2.35.55-3.3 1.5-3.85 3.85-.55-2.35-1.5-3.3-3.85-3.85 2.35-.55 3.3-1.5 3.85-3.85Z"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinejoin="round"
      />
      <path d="M8 22.5h4.5M35.5 27H40" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  );
}

function HeaderMetric({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[11px] font-medium text-teal-50/85">
      {icon}
      {label}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span className="mt-5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-600 text-white shadow-sm shadow-teal-950/10">
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

function SuggestionButtons({
  suggestions,
  onPick,
  disabled,
  compact,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", compact ? "ml-8 mt-3" : "mt-4")}>
      <p className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {compact ? "Helpful next move" : "Try one of these"}
      </p>
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          disabled={disabled}
          className="group flex w-full items-center justify-between gap-3 rounded-md border border-teal-100 bg-white/90 px-3 py-2.5 text-left text-xs font-medium text-slate-600 shadow-sm shadow-teal-950/[0.02] transition hover:border-teal-300 hover:bg-teal-100/70 hover:text-teal-800 disabled:pointer-events-none disabled:opacity-60"
        >
          <span>{s}</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-teal-700" />
        </button>
      ))}
    </div>
  );
}

/** Minimal `**bold**` rendering; everything else passes through (newlines preserved by CSS). */
function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}
