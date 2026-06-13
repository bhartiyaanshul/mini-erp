import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AdminUser,
  AssistantReply,
  AuditLog,
  BoM,
  ChatMessage,
  ConfirmResult,
  DashboardMetrics,
  ForecastResponse,
  ForecastRow,
  ManufacturingOrder,
  OrderJourney,
  Partner,
  PendingAction,
  Product,
  ProductTimeline,
  ProcurementResult,
  PurchaseOrder,
  SaleOrder,
  StockMove,
} from "./types";

const get = <T>(url: string) => api.get<T>(url).then((r) => r.data);

/* --------------------------------- Queries --------------------------------- */
export const useProducts = () =>
  useQuery({ queryKey: ["products"], queryFn: () => get<Product[]>("/products") });

export const useProduct = (id?: number) =>
  useQuery({ queryKey: ["product", id], queryFn: () => get<Product>(`/products/${id}`), enabled: !!id });

export const usePartners = (type?: "customer" | "vendor", enabled = true) =>
  useQuery({
    queryKey: ["partners", type],
    queryFn: () => get<Partner[]>(`/partners${type ? `?type=${type}` : ""}`),
    enabled,
  });

export const useSales = (enabled = true) =>
  useQuery({ queryKey: ["sales"], queryFn: () => get<SaleOrder[]>("/sales"), enabled });

// Rich internal order-tracking timeline for one sale order.
export const useOrderJourney = (id?: number) =>
  useQuery({
    queryKey: ["journey", id],
    queryFn: () => get<OrderJourney>(`/sales/${id}/journey`),
    enabled: !!id,
  });

// Public, sanitized tracking view fetched by signed token (no auth required).
export const usePublicJourney = (token?: string) =>
  useQuery({
    queryKey: ["public-journey", token],
    queryFn: () => get<OrderJourney>(`/public/track/${token}`),
    enabled: !!token,
    retry: false,
  });

export const usePurchase = (enabled = true) =>
  useQuery({ queryKey: ["purchase"], queryFn: () => get<PurchaseOrder[]>("/purchase"), enabled });

export const useMOs = (enabled = true) =>
  useQuery({ queryKey: ["mos"], queryFn: () => get<ManufacturingOrder[]>("/manufacturing/orders"), enabled });

export const useBoms = () => useQuery({ queryKey: ["boms"], queryFn: () => get<BoM[]>("/boms") });

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: () => get<DashboardMetrics>("/dashboard") });

export const useLowStock = () =>
  useQuery({ queryKey: ["low-stock"], queryFn: () => get<any[]>("/dashboard/low-stock") });

// Deterministic forecast rows. Gated by `enabled` so it only runs on demand.
export const useForecast = (enabled = true) =>
  useQuery({ queryKey: ["forecast"], queryFn: () => get<ForecastRow[]>("/forecast"), enabled });

// Rows + AI (Groq) briefing. Gated by `enabled` so the LLM call only fires on a click.
export const useForecastBriefing = (enabled = true) =>
  useQuery({ queryKey: ["forecast-briefing"], queryFn: () => get<ForecastResponse>("/forecast/briefing"), enabled });

export const useAudit = (entity_type?: string) =>
  useQuery({
    queryKey: ["audit", entity_type],
    queryFn: () => get<AuditLog[]>(`/audit${entity_type ? `?entity_type=${entity_type}` : ""}`),
  });

export const useTimeline = (productId?: number) =>
  useQuery({
    queryKey: ["timeline", productId],
    queryFn: () => get<ProductTimeline>(`/audit/timeline/${productId}`),
    enabled: !!productId,
  });

export const useStockMoves = (productId?: number) =>
  useQuery({
    queryKey: ["moves", productId],
    queryFn: () => get<StockMove[]>(`/stock/moves${productId ? `?product_id=${productId}` : ""}`),
  });

/* -------------------------------- Mutations -------------------------------- */
function useInvalidatingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries(),
  });
}

export const useCreateProduct = () =>
  useInvalidatingMutation((body: any) => api.post("/products", body).then((r) => r.data));

export const useUpdateProduct = () =>
  useInvalidatingMutation(({ id, body }: { id: number; body: any }) =>
    api.put(`/products/${id}`, body).then((r) => r.data)
  );

export const useAdjustStock = () =>
  useInvalidatingMutation((body: { product_id: number; qty: number; note?: string }) =>
    api.post("/stock/adjust", body).then((r) => r.data)
  );

export const useCreatePartner = () =>
  useInvalidatingMutation((body: any) => api.post("/partners", body).then((r) => r.data));

export const useCreateSale = () =>
  useInvalidatingMutation((body: any) => api.post<SaleOrder>("/sales", body).then((r) => r.data));

export const useConfirmSale = () =>
  useInvalidatingMutation((id: number) =>
    api.post<ConfirmResult>(`/sales/${id}/confirm`).then((r) => r.data)
  );

export const useDeliverSale = () =>
  useInvalidatingMutation((id: number) => api.post(`/sales/${id}/deliver`).then((r) => r.data));

export const useCancelSale = () =>
  useInvalidatingMutation((id: number) => api.post(`/sales/${id}/cancel`).then((r) => r.data));

export const useCreatePO = () =>
  useInvalidatingMutation((body: any) => api.post<PurchaseOrder>("/purchase", body).then((r) => r.data));

export const useReceivePO = () =>
  useInvalidatingMutation((id: number) => api.post(`/purchase/${id}/receive`).then((r) => r.data));

export const useCreateMO = () =>
  useInvalidatingMutation((body: any) => api.post("/manufacturing/orders", body).then((r) => r.data));

export const useConfirmMO = () =>
  useInvalidatingMutation((id: number) =>
    api.post(`/manufacturing/orders/${id}/confirm`).then((r) => r.data)
  );

export const useCompleteMO = () =>
  useInvalidatingMutation((id: number) =>
    api.post(`/manufacturing/orders/${id}/complete`).then((r) => r.data)
  );

export const useCompleteWorkOrder = () =>
  useInvalidatingMutation((id: number) =>
    api.post(`/manufacturing/workorders/${id}/complete`).then((r) => r.data)
  );

export const useCreateBom = () =>
  useInvalidatingMutation((body: any) => api.post("/boms", body).then((r) => r.data));

export const useLoadDemo = () =>
  useInvalidatingMutation(() => api.post("/seed/demo").then((r) => r.data));

/* ----------------------------- User management ----------------------------- */
export const useUsers = (enabled = true) =>
  useQuery({ queryKey: ["users"], queryFn: () => get<AdminUser[]>("/users"), enabled });

export const useCreateUser = () =>
  useInvalidatingMutation((body: any) => api.post<AdminUser>("/users", body).then((r) => r.data));

export const useUpdateUser = () =>
  useInvalidatingMutation(({ id, body }: { id: number; body: any }) =>
    api.put<AdminUser>(`/users/${id}`, body).then((r) => r.data)
  );

export const useUpdateUserAccess = () =>
  useInvalidatingMutation(({ id, access }: { id: number; access: Record<string, string> }) =>
    api.put<AdminUser>(`/users/${id}/access`, { access }).then((r) => r.data)
  );

export const useDeleteUser = () =>
  useInvalidatingMutation((id: number) => api.delete(`/users/${id}`).then((r) => r.data));

export const useActOnForecast = () =>
  useInvalidatingMutation((body: { product_id: number; qty: number }) =>
    api.post<ProcurementResult>("/forecast/act", body).then((r) => r.data)
  );

// Copilot: chat is a plain mutation (no cache to touch); execute invalidates everything.
export const useAssistantChat = () =>
  useMutation({
    mutationFn: (messages: ChatMessage[]) =>
      api.post<AssistantReply>("/assistant/chat", { messages }).then((r) => r.data),
  });

export const useAssistantExecute = () =>
  useInvalidatingMutation((action: PendingAction) =>
    api.post<{ message: string }>("/assistant/execute", { action: { type: action.type, args: action.args } }).then((r) => r.data)
  );
