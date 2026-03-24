import { storageGet, storageSet } from "../utils/safeStorage";
import { getAccessToken } from "../utils/auth";
import { CONFIG_STORAGE_KEY } from "../constants";

const V2_KEY = "taproot_dealer_ledger_v2";
const V2_BACKUP = "taproot_dealer_ledger_v2_backup";
const V1_KEY = "taproot_dealer_inventory_v1";

export interface Product {
  id: string;
  name: string;
  spec: string;
  sku: string;
  unit: string;
  qtyOnHand: number;
  note: string;
  updatedAt: number;
}

export interface OrderLine {
  productId: string | null;
  name: string;
  sku: string;
  unit: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
}

export interface SalesOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  orderDate: string;
  expectedRepaymentDate: string;
  items: OrderLine[];
  totalAmount: number;
  note: string;
  stockOutApplied: boolean;
  createdAt: number;
}

export interface PurchaseOrder {
  id: string;
  supplierName: string;
  orderDate: string;
  dueDate: string;
  termsNote: string;
  items: OrderLine[];
  totalAmount: number;
  note: string;
  stockInApplied: boolean;
  createdAt: number;
}

export type PayMethod = "cash" | "transfer" | "wechat" | "alipay" | "credit" | "other";

export interface SalesPayment {
  id: string;
  salesOrderId: string;
  amount: number;
  paidAt: number;
  note: string;
  payMethod: PayMethod;
}

export interface PurchasePayment {
  id: string;
  purchaseOrderId: string;
  amount: number;
  paidAt: number;
  note: string;
  payMethod: PayMethod;
}

export interface SalesReturn {
  id: string;
  salesOrderId: string;
  items: OrderLine[];
  totalAmount: number;
  returnDate: string;
  stockReturned: boolean;
  note: string;
  createdAt: number;
}

export interface PurchaseReturn {
  id: string;
  purchaseOrderId: string;
  items: OrderLine[];
  totalAmount: number;
  returnDate: string;
  stockReturned: boolean;
  note: string;
  createdAt: number;
}

export interface LedgerState {
  version: 2;
  products: Product[];
  salesOrders: SalesOrder[];
  purchaseOrders: PurchaseOrder[];
  salesPayments: SalesPayment[];
  purchasePayments: PurchasePayment[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
}

export function emptyLedger(): LedgerState {
  return {
    version: 2,
    products: [],
    salesOrders: [],
    purchaseOrders: [],
    salesPayments: [],
    purchasePayments: [],
    salesReturns: [],
    purchaseReturns: [],
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function sumLineTotals(lines: OrderLine[]): number {
  return round2(lines.reduce((a, l) => a + (Number(l.lineTotal) || 0), 0));
}

export function recalcLine(line: OrderLine): OrderLine {
  const qty = Math.max(0, Number(line.qty) || 0);
  const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
  const unitCost = Math.max(0, Number(line.unitCost) || 0);
  return { ...line, qty, unitPrice, unitCost, lineTotal: round2(qty * unitPrice) };
}

/* ── per-order helpers ── */

export function salesPaidTotal(state: LedgerState, orderId: string): number {
  return round2(
    state.salesPayments.filter((p) => p.salesOrderId === orderId).reduce((a, p) => a + p.amount, 0)
  );
}

export function salesReturnTotal(state: LedgerState, orderId: string): number {
  return round2(
    (state.salesReturns || []).filter((r) => r.salesOrderId === orderId).reduce((a, r) => a + r.totalAmount, 0)
  );
}

export function salesBalance(state: LedgerState, order: SalesOrder): number {
  return Math.max(0, round2(order.totalAmount - salesReturnTotal(state, order.id) - salesPaidTotal(state, order.id)));
}

export function purchasePaidTotal(state: LedgerState, orderId: string): number {
  return round2(
    state.purchasePayments.filter((p) => p.purchaseOrderId === orderId).reduce((a, p) => a + p.amount, 0)
  );
}

export function purchaseReturnTotal(state: LedgerState, orderId: string): number {
  return round2(
    (state.purchaseReturns || []).filter((r) => r.purchaseOrderId === orderId).reduce((a, r) => a + r.totalAmount, 0)
  );
}

export function purchaseBalance(state: LedgerState, order: PurchaseOrder): number {
  return Math.max(0, round2(order.totalAmount - purchaseReturnTotal(state, order.id) - purchasePaidTotal(state, order.id)));
}

/* ── aggregate helpers ── */

export function totalReceivable(state: LedgerState): number {
  return round2(state.salesOrders.reduce((a, o) => a + Math.max(0, salesBalance(state, o)), 0));
}

export function totalPayable(state: LedgerState): number {
  return round2(state.purchaseOrders.reduce((a, o) => a + Math.max(0, purchaseBalance(state, o)), 0));
}

export function totalSalesGross(state: LedgerState): number {
  return round2(state.salesOrders.reduce((a, o) => a + o.totalAmount, 0));
}

export function totalSalesPaid(state: LedgerState): number {
  return round2(state.salesPayments.reduce((a, p) => a + p.amount, 0));
}

export function totalPurchaseGross(state: LedgerState): number {
  return round2(state.purchaseOrders.reduce((a, o) => a + o.totalAmount, 0));
}

export function totalPurchasePaid(state: LedgerState): number {
  return round2(state.purchasePayments.reduce((a, p) => a + p.amount, 0));
}

/* ── customer-level aggregation ── */

export interface CustomerSummary {
  name: string;
  phone: string;
  total: number;
  paid: number;
  balance: number;
  orderCount: number;
}

export function customerReceivables(state: LedgerState): CustomerSummary[] {
  const map = new Map<string, { phone: string; total: number; returned: number; paid: number; count: number }>();
  for (const o of state.salesOrders) {
    const key = o.customerName.trim();
    if (!key) continue;
    const existing = map.get(key) || { phone: "", total: 0, returned: 0, paid: 0, count: 0 };
    existing.phone = existing.phone || o.customerPhone;
    existing.total += o.totalAmount;
    existing.returned += salesReturnTotal(state, o.id);
    existing.paid += salesPaidTotal(state, o.id);
    existing.count++;
    map.set(key, existing);
  }
  return [...map.entries()]
    .map(([name, d]) => ({
      name,
      phone: d.phone,
      total: round2(d.total),
      paid: round2(d.paid),
      balance: Math.max(0, round2(d.total - d.returned - d.paid)),
      orderCount: d.count,
    }))
    .filter((c) => c.balance > 0.001)
    .sort((a, b) => b.balance - a.balance);
}

/* ── autocomplete helpers ── */

export function uniqueCustomerNames(state: LedgerState): string[] {
  const set = new Set<string>();
  for (const o of state.salesOrders) {
    const n = o.customerName.trim();
    if (n) set.add(n);
  }
  return [...set].sort();
}

export function uniqueSupplierNames(state: LedgerState): string[] {
  const set = new Set<string>();
  for (const o of state.purchaseOrders) {
    const n = o.supplierName.trim();
    if (n) set.add(n);
  }
  return [...set].sort();
}

/* ── today helpers ── */

export function todaySalesTotal(state: LedgerState): number {
  const today = todayISODate();
  return round2(state.salesOrders.filter((o) => o.orderDate === today).reduce((a, o) => a + o.totalAmount, 0));
}

export function todaySalesCount(state: LedgerState): number {
  const today = todayISODate();
  return state.salesOrders.filter((o) => o.orderDate === today).length;
}

/**
 * Snapshot-based profit: uses the unitCost recorded at order-creation time,
 * NOT the current FIFO cost. This means profit reflects the cost that was
 * locked in when the sales order was created and will not change retroactively
 * if new purchase batches are added later.
 */
export function todayProfit(state: LedgerState): number {
  const today = todayISODate();
  let profit = 0;
  for (const o of state.salesOrders) {
    if (o.orderDate !== today) continue;
    for (const line of o.items) {
      profit += (line.unitPrice - (line.unitCost || 0)) * line.qty;
    }
  }
  return round2(profit);
}

function soldQtyStockOut(state: LedgerState, productId: string): number {
  let qty = 0;
  for (const so of state.salesOrders) {
    if (!so.stockOutApplied) continue;
    for (const line of so.items) {
      if (line.productId === productId) qty += line.qty;
    }
  }
  for (const sr of state.salesReturns || []) {
    if (!sr.stockReturned) continue;
    for (const line of sr.items) {
      if (line.productId === productId) qty -= line.qty;
    }
  }
  return Math.max(0, qty);
}

/**
 * FIFO cost: collect purchase batches oldest-first, deduct only
 * stock-out-applied sales qty, return cost of the first batch with remaining stock.
 */
export function fifoCostPrice(state: LedgerState, productId: string): number {
  const batches: Array<{ qty: number; cost: number; time: number }> = [];
  for (const po of state.purchaseOrders) {
    for (const line of po.items) {
      if (line.productId === productId) {
        batches.push({ qty: line.qty, cost: line.unitPrice, time: po.createdAt });
      }
    }
  }
  if (batches.length === 0) return 0;
  batches.sort((a, b) => a.time - b.time);

  let remaining = soldQtyStockOut(state, productId);
  for (const b of batches) {
    if (remaining < b.qty) return b.cost;
    remaining -= b.qty;
  }
  return batches[batches.length - 1].cost;
}

export interface FifoBatch {
  purchaseOrderId: string;
  orderDate: string;
  inQty: number;
  remainQty: number;
  unitCost: number;
}

export function productFifoBatches(state: LedgerState, productId: string): FifoBatch[] {
  const raw: Array<{ poId: string; date: string; qty: number; cost: number; time: number }> = [];
  for (const po of state.purchaseOrders) {
    for (const line of po.items) {
      if (line.productId === productId) {
        raw.push({ poId: po.id, date: po.orderDate, qty: line.qty, cost: line.unitPrice, time: po.createdAt });
      }
    }
  }
  raw.sort((a, b) => a.time - b.time);

  let toDeduct = soldQtyStockOut(state, productId);
  return raw.map((b) => {
    const consumed = Math.min(toDeduct, b.qty);
    toDeduct = round2(Math.max(0, toDeduct - consumed));
    return {
      purchaseOrderId: b.poId,
      orderDate: b.date,
      inQty: b.qty,
      remainQty: round2(b.qty - consumed),
      unitCost: b.cost,
    };
  });
}

/** @deprecated use fifoCostPrice */
export const latestPurchasePrice = fifoCostPrice;

export function customerPhoneLookup(state: LedgerState, name: string): string {
  const trimmed = name.trim();
  for (const o of state.salesOrders) {
    if (o.customerName.trim() === trimmed && o.customerPhone.trim()) return o.customerPhone.trim();
  }
  return "";
}

/* ── date helpers ── */

export function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isDateBeforeToday(isoDate: string): boolean {
  return isoDate < todayISODate();
}

/* ── persistence ── */

function migrateV1(raw: unknown): LedgerState {
  const st = emptyLedger();
  if (!raw || typeof raw !== "object") return st;
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items : [];
  for (const x of items) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    st.products.push({
      id: String(r.id || nid("pr")),
      name: String(r.name || "").trim(),
      spec: "",
      sku: String(r.sku || "").trim(),
      unit: String(r.unit || "件").trim() || "件",
      qtyOnHand: Math.max(0, Number(r.qty) || 0),
      note: String(r.note || ""),
      updatedAt: Number(r.updatedAt) || Date.now(),
    });
  }
  return st;
}

function parseV2(raw: unknown): LedgerState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (Number(o.version) !== 2) return null;
  const products = Array.isArray(o.products) ? o.products : [];
  const salesOrders = Array.isArray(o.salesOrders) ? o.salesOrders : [];
  const purchaseOrders = Array.isArray(o.purchaseOrders) ? o.purchaseOrders : [];
  const salesPayments = Array.isArray(o.salesPayments) ? o.salesPayments : [];
  const purchasePayments = Array.isArray(o.purchasePayments) ? o.purchasePayments : [];

  const mapLine = (x: any): OrderLine => ({
    productId: x.productId ? String(x.productId) : null,
    name: String(x.name || "").trim(),
    sku: String(x.sku || "").trim(),
    unit: String(x.unit || "件").trim() || "件",
    qty: Math.max(0, Number(x.qty) || 0),
    unitPrice: Math.max(0, Number(x.unitPrice) || 0),
    unitCost: Math.max(0, Number(x.unitCost) || 0),
    lineTotal: round2(Number(x.lineTotal) || 0),
  });

  return {
    version: 2,
    products: products
      .filter((x: unknown) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id || nid("pr")),
        name: String(x.name || "").trim(),
        spec: String(x.spec || "").trim(),
        sku: String(x.sku || "").trim(),
        unit: String(x.unit || "件").trim() || "件",
        qtyOnHand: Math.max(0, Number(x.qtyOnHand ?? x.qty) || 0),
        note: String(x.note || ""),
        updatedAt: Number(x.updatedAt) || Date.now(),
      })),
    salesOrders: salesOrders
      .filter((x: unknown) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id || nid("so")),
        customerName: String(x.customerName || "").trim(),
        customerPhone: String(x.customerPhone || "").trim(),
        orderDate: String(x.orderDate || todayISODate()).slice(0, 10),
        expectedRepaymentDate: String(x.expectedRepaymentDate || todayISODate()).slice(0, 10),
        items: Array.isArray(x.items) ? x.items.map(mapLine) : [],
        totalAmount: round2(Number(x.totalAmount) || 0),
        note: String(x.note || ""),
        stockOutApplied: Boolean(x.stockOutApplied),
        createdAt: Number(x.createdAt) || Date.now(),
      })),
    purchaseOrders: purchaseOrders
      .filter((x: unknown) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id || nid("po")),
        supplierName: String(x.supplierName || "").trim(),
        orderDate: String(x.orderDate || todayISODate()).slice(0, 10),
        dueDate: String(x.dueDate || todayISODate()).slice(0, 10),
        termsNote: String(x.termsNote || "").trim(),
        items: Array.isArray(x.items) ? x.items.map(mapLine) : [],
        totalAmount: round2(Number(x.totalAmount) || 0),
        note: String(x.note || ""),
        stockInApplied: Boolean(x.stockInApplied),
        createdAt: Number(x.createdAt) || Date.now(),
      })),
    salesPayments: salesPayments
      .filter((x: unknown) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id || nid("sp")),
        salesOrderId: String(x.salesOrderId || ""),
        amount: round2(Number(x.amount) || 0),
        paidAt: Number(x.paidAt) || Date.now(),
        note: String(x.note || ""),
        payMethod: (x.payMethod as PayMethod) || "cash",
      })),
    purchasePayments: purchasePayments
      .filter((x: unknown) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id || nid("pp")),
        purchaseOrderId: String(x.purchaseOrderId || ""),
        amount: round2(Number(x.amount) || 0),
        paidAt: Number(x.paidAt) || Date.now(),
        note: String(x.note || ""),
        payMethod: (x.payMethod as PayMethod) || "cash",
      })),
    salesReturns: (Array.isArray(o.salesReturns) ? o.salesReturns : [])
      .filter((x: unknown) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id || nid("sr")),
        salesOrderId: String(x.salesOrderId || ""),
        items: Array.isArray(x.items) ? x.items.map(mapLine) : [],
        totalAmount: round2(Number(x.totalAmount) || 0),
        returnDate: String(x.returnDate || todayISODate()).slice(0, 10),
        stockReturned: Boolean(x.stockReturned),
        note: String(x.note || ""),
        createdAt: Number(x.createdAt) || Date.now(),
      })),
    purchaseReturns: (Array.isArray(o.purchaseReturns) ? o.purchaseReturns : [])
      .filter((x: unknown) => x && typeof x === "object")
      .map((x: any) => ({
        id: String(x.id || nid("prr")),
        purchaseOrderId: String(x.purchaseOrderId || ""),
        items: Array.isArray(x.items) ? x.items.map(mapLine) : [],
        totalAmount: round2(Number(x.totalAmount) || 0),
        returnDate: String(x.returnDate || todayISODate()).slice(0, 10),
        stockReturned: Boolean(x.stockReturned),
        note: String(x.note || ""),
        createdAt: Number(x.createdAt) || Date.now(),
      })),
  };
}

export function loadLedgerState(): LedgerState {
  const v2main = storageGet(V2_KEY);
  if (v2main) {
    try {
      const p = parseV2(JSON.parse(v2main));
      if (p) return p;
    } catch {
      /* fall through */
    }
  }
  const v2b = storageGet(V2_BACKUP);
  if (v2b) {
    try {
      const p = parseV2(JSON.parse(v2b));
      if (p) return p;
    } catch {
      /* fall through */
    }
  }
  const v1 = storageGet(V1_KEY);
  if (v1) {
    try {
      return migrateV1(JSON.parse(v1));
    } catch {
      /* fall through */
    }
  }
  return emptyLedger();
}

export function saveLedgerState(state: LedgerState): void {
  const json = JSON.stringify(state);
  storageSet(V2_KEY, json);
  storageSet(V2_BACKUP, json);
}

/* ── product CRUD ── */

export function addProduct(
  state: LedgerState,
  row: { name: string; spec: string; sku: string; unit: string; qtyOnHand: number; note: string }
): LedgerState {
  const p: Product = {
    id: nid("pr"),
    name: row.name.trim(),
    spec: (row.spec || "").trim(),
    sku: row.sku.trim(),
    unit: (row.unit || "件").trim() || "件",
    qtyOnHand: Math.max(0, row.qtyOnHand),
    note: row.note.trim(),
    updatedAt: Date.now(),
  };
  return { ...state, products: [...state.products, p] };
}

export function updateProduct(
  state: LedgerState,
  productId: string,
  patch: Partial<Pick<Product, "name" | "spec" | "sku" | "unit" | "qtyOnHand" | "note">>
): LedgerState {
  return {
    ...state,
    products: state.products.map((p) => {
      if (p.id !== productId) return p;
      const updated = { ...p, updatedAt: Date.now() };
      if (patch.name !== undefined) updated.name = patch.name.trim();
      if (patch.spec !== undefined) updated.spec = patch.spec.trim();
      if (patch.sku !== undefined) updated.sku = patch.sku.trim();
      if (patch.unit !== undefined) updated.unit = (patch.unit || "件").trim() || "件";
      if (patch.qtyOnHand !== undefined) updated.qtyOnHand = Math.max(0, patch.qtyOnHand);
      if (patch.note !== undefined) updated.note = patch.note.trim();
      return updated;
    }),
  };
}

export function deleteProduct(state: LedgerState, productId: string): LedgerState {
  return { ...state, products: state.products.filter((p) => p.id !== productId) };
}

/* ── sales order CRUD ── */

export function addSalesOrder(
  state: LedgerState,
  draft: Omit<SalesOrder, "id" | "totalAmount" | "createdAt" | "stockOutApplied"> & { stockOutApplied?: boolean }
): LedgerState {
  const items = draft.items.map(recalcLine);
  const totalAmount = sumLineTotals(items);
  const o: SalesOrder = {
    id: nid("so"),
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim(),
    orderDate: draft.orderDate.slice(0, 10),
    expectedRepaymentDate: draft.expectedRepaymentDate.slice(0, 10),
    items,
    totalAmount,
    note: draft.note.trim(),
    stockOutApplied: Boolean(draft.stockOutApplied),
    createdAt: Date.now(),
  };
  return { ...state, salesOrders: [o, ...state.salesOrders] };
}

export function editSalesOrder(
  state: LedgerState,
  orderId: string,
  patch: Partial<Pick<SalesOrder, "customerName" | "customerPhone" | "orderDate" | "expectedRepaymentDate" | "items" | "note">>
): LedgerState {
  const old = state.salesOrders.find((o) => o.id === orderId);
  if (!old) return state;

  let products = state.products;
  const itemsChanged = patch.items !== undefined;

  if (itemsChanged && old.stockOutApplied) {
    products = [...products];
    for (const line of old.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand + line.qty), updatedAt: Date.now() };
    }
  }

  const salesOrders = state.salesOrders.map((o) => {
    if (o.id !== orderId) return o;
    const updated = { ...o };
    if (patch.customerName !== undefined) updated.customerName = patch.customerName.trim();
    if (patch.customerPhone !== undefined) updated.customerPhone = patch.customerPhone.trim();
    if (patch.orderDate !== undefined) updated.orderDate = patch.orderDate.slice(0, 10);
    if (patch.expectedRepaymentDate !== undefined)
      updated.expectedRepaymentDate = patch.expectedRepaymentDate.slice(0, 10);
    if (patch.note !== undefined) updated.note = patch.note.trim();
    if (patch.items) {
      updated.items = patch.items.map(recalcLine);
      updated.totalAmount = sumLineTotals(updated.items);
    }
    return updated;
  });

  if (itemsChanged && old.stockOutApplied) {
    const newOrder = salesOrders.find((o) => o.id === orderId)!;
    for (const line of newOrder.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand - line.qty), updatedAt: Date.now() };
    }
  }

  return { ...state, products, salesOrders };
}

/* ── purchase order CRUD ── */

export function addPurchaseOrder(
  state: LedgerState,
  draft: Omit<PurchaseOrder, "id" | "totalAmount" | "createdAt" | "stockInApplied"> & { stockInApplied?: boolean }
): LedgerState {
  const items = draft.items.map(recalcLine);
  const totalAmount = sumLineTotals(items);
  const o: PurchaseOrder = {
    id: nid("po"),
    supplierName: draft.supplierName.trim(),
    orderDate: draft.orderDate.slice(0, 10),
    dueDate: draft.dueDate.slice(0, 10),
    termsNote: draft.termsNote.trim(),
    items,
    totalAmount,
    note: draft.note.trim(),
    stockInApplied: Boolean(draft.stockInApplied),
    createdAt: Date.now(),
  };
  return { ...state, purchaseOrders: [o, ...state.purchaseOrders] };
}

export function editPurchaseOrder(
  state: LedgerState,
  orderId: string,
  patch: Partial<Pick<PurchaseOrder, "supplierName" | "orderDate" | "dueDate" | "termsNote" | "items" | "note">>
): LedgerState {
  const old = state.purchaseOrders.find((o) => o.id === orderId);
  if (!old) return state;

  let products = state.products;
  const itemsChanged = patch.items !== undefined;

  if (itemsChanged && old.stockInApplied) {
    products = [...products];
    for (const line of old.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand - line.qty), updatedAt: Date.now() };
    }
  }

  const purchaseOrders = state.purchaseOrders.map((o) => {
    if (o.id !== orderId) return o;
    const updated = { ...o };
    if (patch.supplierName !== undefined) updated.supplierName = patch.supplierName.trim();
    if (patch.orderDate !== undefined) updated.orderDate = patch.orderDate.slice(0, 10);
    if (patch.dueDate !== undefined) updated.dueDate = patch.dueDate.slice(0, 10);
    if (patch.termsNote !== undefined) updated.termsNote = patch.termsNote.trim();
    if (patch.note !== undefined) updated.note = patch.note.trim();
    if (patch.items) {
      updated.items = patch.items.map(recalcLine);
      updated.totalAmount = sumLineTotals(updated.items);
    }
    return updated;
  });

  if (itemsChanged && old.stockInApplied) {
    const newOrder = purchaseOrders.find((o) => o.id === orderId)!;
    for (const line of newOrder.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand + line.qty), updatedAt: Date.now() };
    }
  }

  return { ...state, products, purchaseOrders };
}

/* ── payments ── */

export function addSalesPayment(state: LedgerState, salesOrderId: string, amount: number, note: string, payMethod: PayMethod = "cash"): LedgerState {
  const order = state.salesOrders.find((o) => o.id === salesOrderId);
  if (!order) return state;
  const bal = salesBalance(state, order);
  const a = round2(amount);
  if (a <= 0 || a > bal + 0.001) return state;
  const pay: SalesPayment = {
    id: nid("sp"),
    salesOrderId,
    amount: a,
    paidAt: Date.now(),
    note: note.trim(),
    payMethod,
  };
  return { ...state, salesPayments: [pay, ...state.salesPayments] };
}

export function addPurchasePayment(
  state: LedgerState,
  purchaseOrderId: string,
  amount: number,
  note: string,
  payMethod: PayMethod = "cash"
): LedgerState {
  const order = state.purchaseOrders.find((o) => o.id === purchaseOrderId);
  if (!order) return state;
  const bal = purchaseBalance(state, order);
  const a = round2(amount);
  if (a <= 0 || a > bal + 0.001) return state;
  const pay: PurchasePayment = {
    id: nid("pp"),
    purchaseOrderId,
    amount: a,
    paidAt: Date.now(),
    note: note.trim(),
    payMethod,
  };
  return { ...state, purchasePayments: [pay, ...state.purchasePayments] };
}

/* ── stock operations ── */

export function applySalesStockOut(state: LedgerState, salesOrderId: string): { state: LedgerState; error?: string } {
  const orderIdx = state.salesOrders.findIndex((o) => o.id === salesOrderId);
  if (orderIdx < 0) return { state };
  const order = state.salesOrders[orderIdx];
  if (order.stockOutApplied) return { state, error: "already" };

  let products = [...state.products];
  const updatedItems = order.items.map((line) => {
    let pid = line.productId;
    const name = line.name.trim();

    if (!pid && name) {
      const byName = products.findIndex((p) => p.name.trim() === name);
      if (byName >= 0) pid = products[byName].id;
    }
    if (!pid) return line;

    const idx = products.findIndex((p) => p.id === pid);
    if (idx < 0) return line;

    const p = products[idx];
    if (p.qtyOnHand < line.qty - 0.0001) {
      return { ...line, productId: pid, _short: p.name } as OrderLine & { _short: string };
    }
    products[idx] = { ...p, qtyOnHand: round2(p.qtyOnHand - line.qty), updatedAt: Date.now() };
    return { ...line, productId: pid };
  });

  const shortLine = updatedItems.find((l: any) => l._short);
  if (shortLine) return { state, error: `short:${(shortLine as any)._short}` };

  const salesOrders = state.salesOrders.map((o, i) =>
    i === orderIdx ? { ...o, items: updatedItems.map(({ _short, ...rest }: any) => rest as OrderLine), stockOutApplied: true } : o
  );
  return { state: { ...state, products, salesOrders } };
}

export function applyPurchaseStockIn(state: LedgerState, purchaseOrderId: string): LedgerState {
  const orderIdx = state.purchaseOrders.findIndex((o) => o.id === purchaseOrderId);
  if (orderIdx < 0) return state;
  const order = state.purchaseOrders[orderIdx];
  if (order.stockInApplied) return state;

  let products = [...state.products];
  const updatedItems = order.items.map((line) => {
    const name = line.name.trim();
    if (!name && !line.productId) return line;

    let pid = line.productId;

    if (pid) {
      const idx = products.findIndex((p) => p.id === pid);
      if (idx >= 0) {
        products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand + line.qty), updatedAt: Date.now() };
        return line;
      }
    }

    if (name) {
      const byName = products.findIndex((p) => p.name.trim() === name);
      if (byName >= 0) {
        products[byName] = { ...products[byName], qtyOnHand: round2(products[byName].qtyOnHand + line.qty), updatedAt: Date.now() };
        return { ...line, productId: products[byName].id };
      }
    }

    const newId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    products.push({
      id: newId,
      name: name || "未命名商品",
      spec: "",
      sku: line.sku || "",
      unit: line.unit || "件",
      qtyOnHand: round2(line.qty),
      note: "",
      updatedAt: Date.now(),
    });
    return { ...line, productId: newId };
  });

  const purchaseOrders = state.purchaseOrders.map((o, i) =>
    i === orderIdx ? { ...o, items: updatedItems, stockInApplied: true } : o
  );
  return { ...state, products, purchaseOrders };
}

/* ── delete with stock rollback ── */

export function deleteSalesOrder(state: LedgerState, salesOrderId: string): LedgerState {
  const order = state.salesOrders.find((o) => o.id === salesOrderId);
  let products = state.products;
  if (order?.stockOutApplied) {
    products = [...products];
    for (const line of order.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx < 0) continue;
      products[idx] = {
        ...products[idx],
        qtyOnHand: round2(products[idx].qtyOnHand + line.qty),
        updatedAt: Date.now(),
      };
    }
  }
  return {
    ...state,
    products,
    salesOrders: state.salesOrders.filter((o) => o.id !== salesOrderId),
    salesPayments: state.salesPayments.filter((p) => p.salesOrderId !== salesOrderId),
    salesReturns: (state.salesReturns || []).filter((r) => r.salesOrderId !== salesOrderId),
  };
}

export function deletePurchaseOrder(state: LedgerState, purchaseOrderId: string): { state: LedgerState; negativeWarnings: string[] } {
  const order = state.purchaseOrders.find((o) => o.id === purchaseOrderId);
  let products = state.products;
  const negativeWarnings: string[] = [];
  if (order?.stockInApplied) {
    products = [...products];
    for (const line of order.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx < 0) continue;
      const newQty = round2(products[idx].qtyOnHand - line.qty);
      if (newQty < 0) negativeWarnings.push(`${products[idx].name}: ${newQty}`);
      products[idx] = { ...products[idx], qtyOnHand: newQty, updatedAt: Date.now() };
    }
  }
  return {
    state: {
      ...state,
      products,
      purchaseOrders: state.purchaseOrders.filter((o) => o.id !== purchaseOrderId),
      purchasePayments: state.purchasePayments.filter((p) => p.purchaseOrderId !== purchaseOrderId),
      purchaseReturns: (state.purchaseReturns || []).filter((r) => r.purchaseOrderId !== purchaseOrderId),
    },
    negativeWarnings,
  };
}

/* ── returns / refunds ── */

export function addSalesReturn(
  state: LedgerState,
  salesOrderId: string,
  items: OrderLine[],
  note: string,
  returnStock: boolean
): LedgerState {
  const order = state.salesOrders.find((o) => o.id === salesOrderId);
  if (!order) return state;
  const recalced = items.map(recalcLine);
  const totalAmount = sumLineTotals(recalced);
  const ret: SalesReturn = {
    id: nid("sr"),
    salesOrderId,
    items: recalced,
    totalAmount,
    returnDate: todayISODate(),
    stockReturned: returnStock,
    note: note.trim(),
    createdAt: Date.now(),
  };

  let products = state.products;
  if (returnStock) {
    products = [...products];
    for (const line of recalced) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) {
        products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand + line.qty), updatedAt: Date.now() };
      }
    }
  }

  return { ...state, products, salesReturns: [...(state.salesReturns || []), ret] };
}

export function addPurchaseReturn(
  state: LedgerState,
  purchaseOrderId: string,
  items: OrderLine[],
  note: string,
  returnStock: boolean
): LedgerState {
  const order = state.purchaseOrders.find((o) => o.id === purchaseOrderId);
  if (!order) return state;
  const recalced = items.map(recalcLine);
  const totalAmount = sumLineTotals(recalced);
  const ret: PurchaseReturn = {
    id: nid("prr"),
    purchaseOrderId,
    items: recalced,
    totalAmount,
    returnDate: todayISODate(),
    stockReturned: returnStock,
    note: note.trim(),
    createdAt: Date.now(),
  };

  let products = state.products;
  if (returnStock) {
    products = [...products];
    for (const line of recalced) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) {
        products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand - line.qty), updatedAt: Date.now() };
      }
    }
  }

  return { ...state, products, purchaseReturns: [...(state.purchaseReturns || []), ret] };
}

export function deleteSalesReturn(state: LedgerState, returnId: string): LedgerState {
  const ret = (state.salesReturns || []).find((r) => r.id === returnId);
  if (!ret) return state;
  let products = state.products;
  if (ret.stockReturned) {
    products = [...products];
    for (const line of ret.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) {
        products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand - line.qty), updatedAt: Date.now() };
      }
    }
  }
  return { ...state, products, salesReturns: (state.salesReturns || []).filter((r) => r.id !== returnId) };
}

export function deletePurchaseReturn(state: LedgerState, returnId: string): LedgerState {
  const ret = (state.purchaseReturns || []).find((r) => r.id === returnId);
  if (!ret) return state;
  let products = state.products;
  if (ret.stockReturned) {
    products = [...products];
    for (const line of ret.items) {
      if (!line.productId) continue;
      const idx = products.findIndex((p) => p.id === line.productId);
      if (idx >= 0) {
        products[idx] = { ...products[idx], qtyOnHand: round2(products[idx].qtyOnHand + line.qty), updatedAt: Date.now() };
      }
    }
  }
  return { ...state, products, purchaseReturns: (state.purchaseReturns || []).filter((r) => r.id !== returnId) };
}

/* ── CSV export ── */

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function exportSalesCSV(state: LedgerState): string {
  const header = "客户,电话,单据日期,预计还款日,订单总额,已收款,未收余额,出库,备注";
  const rows = state.salesOrders.map((o) => {
    const paid = salesPaidTotal(state, o.id);
    const bal = salesBalance(state, o);
    return [
      csvEscape(o.customerName),
      csvEscape(o.customerPhone),
      o.orderDate,
      o.expectedRepaymentDate,
      o.totalAmount.toFixed(2),
      paid.toFixed(2),
      bal.toFixed(2),
      o.stockOutApplied ? "是" : "否",
      csvEscape(o.note),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function exportPurchasesCSV(state: LedgerState): string {
  const header = "供应商,单据日期,应付到期日,账期说明,订单总额,已付款,未付余额,入库,备注";
  const rows = state.purchaseOrders.map((o) => {
    const paid = purchasePaidTotal(state, o.id);
    const bal = purchaseBalance(state, o);
    return [
      csvEscape(o.supplierName),
      o.orderDate,
      o.dueDate,
      csvEscape(o.termsNote),
      o.totalAmount.toFixed(2),
      paid.toFixed(2),
      bal.toFixed(2),
      o.stockInApplied ? "是" : "否",
      csvEscape(o.note),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function exportStockCSV(state: LedgerState): string {
  const header = "商品名称,规格,编码/SKU,单位,库存数量,备注";
  const rows = state.products.map((p) =>
    [
      csvEscape(p.name),
      csvEscape(p.spec),
      csvEscape(p.sku),
      csvEscape(p.unit),
      String(p.qtyOnHand),
      csvEscape(p.note),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

export function exportAllCSV(state: LedgerState): string {
  const sections: string[] = [];
  if (state.salesOrders.length > 0) {
    sections.push("【销售订单】\n" + exportSalesCSV(state));
  }
  if (state.purchaseOrders.length > 0) {
    sections.push("【进货订单】\n" + exportPurchasesCSV(state));
  }
  if (state.products.length > 0) {
    sections.push("【库存商品】\n" + exportStockCSV(state));
  }
  if (state.salesReturns?.length > 0) {
    const rh = "关联销售单ID,退货日期,退货金额,退回库存,备注";
    const rr = state.salesReturns.map((r) =>
      [r.salesOrderId, r.returnDate, r.totalAmount.toFixed(2), r.stockReturned ? "是" : "否", csvEscape(r.note)].join(",")
    );
    sections.push("【销售退货】\n" + [rh, ...rr].join("\n"));
  }
  if (state.purchaseReturns?.length > 0) {
    const rh = "关联进货单ID,退货日期,退货金额,退回库存,备注";
    const rr = state.purchaseReturns.map((r) =>
      [r.purchaseOrderId, r.returnDate, r.totalAmount.toFixed(2), r.stockReturned ? "是" : "否", csvEscape(r.note)].join(",")
    );
    sections.push("【进货退货】\n" + [rh, ...rr].join("\n"));
  }
  return sections.join("\n\n");
}

/* ── cloud sync ── */

const LEDGER_VERSION_KEY = "taproot_ledger_cloud_version";

function getBackendConfig() {
  try {
    const saved = storageGet(CONFIG_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const bpc = parsed.backendProxyConfig;
    if (!bpc?.enabled || !bpc.supabaseUrl || bpc.supabaseUrl.includes("your-")) return null;
    return {
      supabaseUrl: bpc.supabaseUrl as string,
      supabaseAnonKey: bpc.supabaseAnonKey as string,
      edgeFunctionName: (bpc.edgeFunctionName || "server") as string,
    };
  } catch {
    return null;
  }
}

function ledgerCloudUrl(): string | null {
  const cfg = getBackendConfig();
  if (!cfg) return null;
  const base = cfg.supabaseUrl.replace(/\/+$/, "");
  return `${base}/functions/v1/${cfg.edgeFunctionName}/ledger`;
}

function cloudHeaders(): Record<string, string> {
  const cfg = getBackendConfig();
  const token = getAccessToken();
  const anonKey = cfg?.supabaseAnonKey || "";
  return {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
  };
}

function isCloudAvailable(): boolean {
  return !!getBackendConfig() && !!getAccessToken();
}

function getCloudVersion(): number {
  return parseInt(storageGet(LEDGER_VERSION_KEY) || "0", 10) || 0;
}

function setCloudVersion(v: number) {
  storageSet(LEDGER_VERSION_KEY, String(v));
}

let _uploadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced upload: push local state to server after a brief delay.
 * Prevents flooding the server during rapid edits.
 */
export function scheduleLedgerUpload(state: LedgerState): void {
  if (!isCloudAvailable()) return;
  if (_uploadTimer) clearTimeout(_uploadTimer);
  _uploadTimer = setTimeout(() => {
    _uploadTimer = null;
    uploadLedger(state).catch((e) => console.warn("[Ledger] upload failed:", e));
  }, 2000);
}

export async function uploadLedger(state: LedgerState): Promise<boolean> {
  const url = ledgerCloudUrl();
  if (!url || !isCloudAvailable()) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: cloudHeaders(),
      body: JSON.stringify({ data: state, version: getCloudVersion() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.conflict) {
        console.warn("[Ledger] Version conflict, will re-pull on next sync");
        return false;
      }
      console.warn("[Ledger] Upload error:", res.status);
      return false;
    }
    const body = await res.json();
    if (body.version) setCloudVersion(body.version);
    return true;
  } catch (e) {
    console.warn("[Ledger] Upload network error:", e);
    return false;
  }
}

/**
 * Pull ledger from server. If the server has a newer version, merge it
 * with local data (server wins for content, local is fallback).
 * Returns the merged state if server was newer, or null if local is current.
 */
export async function pullLedgerFromCloud(): Promise<LedgerState | null> {
  const url = ledgerCloudUrl();
  if (!url || !isCloudAvailable()) return null;
  try {
    const res = await fetch(url, { method: "GET", headers: cloudHeaders() });
    if (!res.ok) {
      console.warn("[Ledger] Pull failed:", res.status);
      return null;
    }
    const body = await res.json();
    if (!body.data) return null;

    const serverVersion = body.version || 0;
    const localVersion = getCloudVersion();

    if (serverVersion <= localVersion) return null;

    const serverState = parseV2(body.data);
    if (!serverState) return null;

    setCloudVersion(serverVersion);
    saveLedgerState(serverState);
    console.log(`[Ledger] Pulled v${serverVersion} from cloud (${serverState.salesOrders.length} sales, ${serverState.products.length} products)`);
    return serverState;
  } catch (e) {
    console.warn("[Ledger] Pull network error:", e);
    return null;
  }
}

/**
 * Full sync: pull from cloud, then upload local if needed.
 * Returns the authoritative state after sync.
 */
export async function syncLedger(): Promise<LedgerState> {
  const local = loadLedgerState();
  if (!isCloudAvailable()) return local;

  const pulled = await pullLedgerFromCloud();
  if (pulled) return pulled;

  const hasData =
    local.products.length > 0 ||
    local.salesOrders.length > 0 ||
    local.purchaseOrders.length > 0;
  if (hasData) {
    await uploadLedger(local);
  }
  return local;
}
