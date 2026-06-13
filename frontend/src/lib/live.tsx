import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { WsEvent } from "./types";

interface LiveCtx {
  events: WsEvent[];
  connected: boolean;
}

const Ctx = createContext<LiveCtx>({ events: [], connected: false });

export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        let ev: WsEvent;
        try {
          ev = JSON.parse(e.data);
        } catch {
          return;
        }
        if (ev.type === "connected") return;

        setEvents((prev) => [ev, ...prev].slice(0, 50));

        // Any domain event means data changed somewhere — refresh everything.
        qc.invalidateQueries();

        notify(ev);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [qc]);

  return <Ctx.Provider value={{ events, connected }}>{children}</Ctx.Provider>;
}

function notify(ev: WsEvent) {
  switch (ev.type) {
    case "procurement_triggered":
      toast.success(ev.message, { description: "Automated procurement", duration: 7000 });
      break;
    case "manufacturing_order_completed":
      toast.success(ev.message, { duration: 6000 });
      break;
    case "purchase_order_received":
      toast.success(ev.message);
      break;
    case "sale_order_delivered":
      toast.success(ev.message);
      break;
    case "demo_loaded":
      toast.success(ev.message);
      break;
    default:
      break;
  }
}

export const useLive = () => useContext(Ctx);
