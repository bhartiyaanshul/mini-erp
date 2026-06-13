export type Module = "sales" | "purchase" | "manufacturing" | "product";
export type AccessLevel = "none" | "user" | "admin";

export const MODULES: Module[] = ["sales", "purchase", "manufacturing", "product"];

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  company_id: number;
  company_name: string;
  is_system_admin: boolean;
  photo: string;
  access: Record<Module, AccessLevel>;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface SignupRequestResponse {
  pending: boolean;
  email: string;
  dev_otp?: string | null;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_system_admin: boolean;
  address: string;
  position: string;
  mobile_number: string;
  photo: string;
  is_active: boolean;
  access: Record<Module, AccessLevel>;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  sales_price: number;
  cost_price: number;
  uom: string;
  procure_on_demand: boolean;
  procurement_type: "buy" | "manufacture";
  default_vendor_id: number | null;
  default_vendor_name: string | null;
  bom_id: number | null;
  on_hand: number;
  reserved: number;
  free_to_use: number;
}

export interface Partner {
  id: number;
  name: string;
  type: "customer" | "vendor" | "both";
  email: string;
  phone: string;
  address: string;
}

export interface OrderLine {
  id: number;
  product_id: number;
  product_name: string;
  qty: number;
  qty_reserved?: number;
  qty_delivered?: number;
  qty_received?: number;
  unit_price: number;
  subtotal: number;
}

export interface SaleOrder {
  id: number;
  name: string;
  partner_id: number;
  partner_name: string;
  state: "draft" | "confirmed" | "partially_delivered" | "fully_delivered" | "cancelled";
  order_date: string;
  promise_date: string | null;
  total: number;
  lines: OrderLine[];
}

export interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: number;
  partner_name: string;
  state: "draft" | "confirmed" | "partially_received" | "fully_received" | "cancelled";
  origin: string;
  order_date: string;
  expected_receipt_date: string | null;
  total: number;
  lines: OrderLine[];
}

export interface ProcurementResult {
  kind: "manufacture" | "buy" | "none";
  doc_name?: string;
  doc_id?: number;
  qty: number;
  product: string;
  message: string;
  line_id?: number;
}

export interface ConfirmResult {
  order: SaleOrder;
  procurements: ProcurementResult[];
}

export interface MOComponent {
  component_product_id: number;
  component_name: string;
  qty_per_unit: number;
  qty_required: number;
  free_to_use: number;
  shortage: number;
}

export interface WorkOrder {
  id: number;
  operation_name: string;
  duration_mins: number;
  work_center: string;
  sequence: number;
  state: "pending" | "in_progress" | "done";
}

export interface ManufacturingOrder {
  id: number;
  name: string;
  product_id: number;
  product_name: string;
  bom_id: number | null;
  qty: number;
  state: "draft" | "confirmed" | "in_progress" | "done" | "cancelled";
  origin: string;
  planned_start: string | null;
  planned_finish: string | null;
  created_at: string;
  components: MOComponent[];
  work_orders: WorkOrder[];
}

export interface JourneyDoc {
  type: string;
  name: string;
  state: string;
}

export interface JourneyStep {
  key: string;
  label: string;
  detail: string;
  status: "done" | "current" | "pending";
  ts: string | null;
  docs?: JourneyDoc[];
  auto?: boolean;
}

export interface JourneyItem {
  name: string;
  qty: number;
  reserved?: number;
  delivered?: number;
}

export interface OrderJourney {
  order: string;
  customer: string;
  company?: string;
  state?: string;
  status_label: string;
  percent: number;
  order_date: string | null;
  promise_date: string | null;
  items: JourneyItem[];
  total?: number;
  steps: JourneyStep[];
  track_path?: string;
}

export interface AtRiskOrder {
  id: number;
  name: string;
  customer: string;
  missing_qty: number;
  revenue: number;
  reason: string;
  next_action: string;
  promise_date: string | null;
}

export interface OrchestrationNode {
  label: string;
  kind: "SO" | "MO" | "PO" | "OUT";
  state: string;
  detail: string | number;
}

export interface OrchestrationRow {
  order: string;
  customer: string;
  value: number;
  nodes: OrchestrationNode[];
}

export interface BoMLine {
  id: number;
  component_product_id: number;
  component_name: string;
  qty: number;
}

export interface BoMOperation {
  id: number;
  name: string;
  duration_mins: number;
  work_center: string;
  sequence: number;
}

export interface BoM {
  id: number;
  name: string;
  product_id: number;
  product_name: string;
  lines: BoMLine[];
  operations: BoMOperation[];
}

export interface DashboardMetrics {
  total_sales_orders: number;
  pending_deliveries: number;
  manufacturing_orders: number;
  mo_open: number;
  mo_done: number;
  delayed_orders: number;
  total_purchase_orders: number;
  partial_receipts: number;
  po_open: number;
  at_risk_orders: AtRiskOrder[];
  revenue_at_risk: number;
  inventory_value: number;
  open_procurement_value: number;
  orchestration: OrchestrationRow[];
  sales_by_state: { state: string; count: number }[];
  mo_by_state: { state: string; count: number }[];
  po_by_state: { state: string; count: number }[];
}

export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  description: string;
  user_id: number | null;
  user_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TimelineEvent {
  ts: string;
  kind: string;
  title: string;
  qty: string;
  state: string;
  note: string;
  source: string;
}

export interface ProductTimeline {
  product: { id: number; name: string; on_hand: number; reserved: number; free_to_use: number };
  events: TimelineEvent[];
}

export interface StockMove {
  id: number;
  product_id: number;
  product_name: string;
  qty: number;
  move_type: "in" | "out";
  state: "draft" | "reserved" | "done";
  source: string;
  source_doc_id: number | null;
  note: string;
  created_at: string;
  done_at: string | null;
}

export interface WsEvent {
  type: string;
  message: string;
  data: Record<string, any>;
  ts: string;
}

export interface ForecastRow {
  product_id: number;
  name: string;
  sku: string;
  uom: string;
  on_hand: number;
  reserved: number;
  free_to_use: number;
  adu: number;
  days_of_cover: number | null;
  stockout_date: string | null;
  reorder_point: number;
  suggested_qty: number;
  trend: "rising" | "falling" | "flat";
  strategy: "buy" | "manufacture";
  urgency: "critical" | "watch" | "ok";
}

export interface ForecastRecommendation {
  product_id: number;
  action: string;
  reason: string;
}

export interface ForecastBriefing {
  summary: string;
  recommendations: ForecastRecommendation[];
  source: "groq" | "template";
}

export interface ForecastResponse {
  rows: ForecastRow[];
  briefing: ForecastBriefing;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ActionPreview {
  title: string;
  lines: string[];
  total?: number;
  confirm?: boolean;
  note?: string;
}

export interface PendingAction {
  type: string;
  args: Record<string, any>;
  preview: ActionPreview;
}

export interface AssistantReply {
  reply: string;
  pending_actions: PendingAction[];
  tool_trace: string[];
}
