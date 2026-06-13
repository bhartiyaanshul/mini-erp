import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AuditLog,
  BoM,
  ConfirmResult,
  DashboardMetrics,
  ManufacturingOrder,
  Partner,
  Product,
  ProductTimeline,
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

export const usePartners = (type?: "customer" | "vendor") =>
  useQuery({
    queryKey: ["partners", type],
    queryFn: () => get<Partner[]>(`/partners${type ? `?type=${type}` : ""}`),
  });

export const useSales = () =>
  useQuery({ queryKey: ["sales"], queryFn: () => get<SaleOrder[]>("/sales") });

export const usePurchase = () =>
  useQuery({ queryKey: ["purchase"], queryFn: () => get<PurchaseOrder[]>("/purchase") });

export const useMOs = () =>
  useQuery({ queryKey: ["mos"], queryFn: () => get<ManufacturingOrder[]>("/manufacturing/orders") });

export const useBoms = () => useQuery({ queryKey: ["boms"], queryFn: () => get<BoM[]>("/boms") });

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: () => get<DashboardMetrics>("/dashboard") });

export const useLowStock = () =>
  useQuery({ queryKey: ["low-stock"], queryFn: () => get<any[]>("/dashboard/low-stock") });

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
