import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Plus,
  X,
  Trash2,
  Package,
  ShoppingCart,
  Truck,
  LayoutDashboard,
  AlertTriangle,
  Search,
  Download,
  Pencil,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { useLanguage, type Translations } from "../hooks/useLanguage";
import type { LedgerState, Product, SalesOrder, PurchaseOrder, OrderLine, FifoBatch } from "../services/dealerLedgerStorage";
import {
  loadLedgerState,
  saveLedgerState,
  syncLedger,
  scheduleLedgerUpload,
  round2,
  totalReceivable,
  totalPayable,
  totalSalesGross,
  totalSalesPaid,
  totalPurchaseGross,
  totalPurchasePaid,
  customerReceivables,
  uniqueCustomerNames,
  customerPhoneLookup,
  todaySalesTotal,
  todaySalesCount,
  todayProfit,
  fifoCostPrice,
  productFifoBatches,
  salesBalance,
  purchaseBalance,
  salesPaidTotal,
  purchasePaidTotal,
  salesReturnTotal,
  purchaseReturnTotal,
  todayISODate,
  isDateBeforeToday,
  addProduct,
  updateProduct,
  deleteProduct,
  addSalesOrder,
  editSalesOrder,
  addPurchaseOrder,
  editPurchaseOrder,
  addSalesPayment,
  addPurchasePayment,
  applySalesStockOut,
  applyPurchaseStockIn,
  deleteSalesOrder,
  deletePurchaseOrder,
  addSalesReturn,
  addPurchaseReturn,
  recalcLine,
  sumLineTotals,
  exportAllCSV,
} from "../services/dealerLedgerStorage";

type Tab = "overview" | "sales" | "purchase" | "stock";
type Inv = Translations["inventory"];
type StatusFilter = "all" | "unpaid" | "partial" | "overdue" | "paid";

function fmtMoney(n: number, lang: string) {
  const loc = lang === "zh" || lang === "zh-TW" ? "zh-CN" : undefined;
  return (Number.isFinite(n) ? n : 0).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(q: number) {
  return q % 1 === 0 ? String(q) : String(round2(q));
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 mt-0.5 mb-2 text-sm outline-none focus:border-emerald-500 box-border";
const dateInputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 mt-0.5 mb-2 text-sm outline-none focus:border-emerald-500 box-border appearance-none";

function sanitizeNum(v: string): string {
  let s = v.replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  if (s.includes(".")) {
    const [int, dec] = s.split(".");
    s = int + "." + dec.slice(0, 2);
  }
  return s;
}

function downloadCSV(content: string, filename: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════ BottomSheet ═══════════════ */

function BottomSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40" role="dialog" aria-modal="true">
      <button type="button" className="flex-1 min-h-[40px] w-full cursor-default" aria-label="Close" onClick={onClose} />
      <div className="bg-white rounded-t-2xl safe-bottom max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 gap-2 flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-base truncate">{title}</h2>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg active:bg-gray-100 flex-shrink-0">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4">
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ Main ═══════════════ */

export function DealerLedgerPage() {
  const { t, language } = useLanguage();
  const inv = t.inventory;
  const [state, setState] = useState<LedgerState>(() => loadLedgerState());
  const [tab, setTab] = useState<Tab>("overview");
  const mountedRef = useRef(true);

  useEffect(() => {
    syncLedger().then((synced) => {
      if (mountedRef.current) setState(synced);
    }).catch(() => {});
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    saveLedgerState(state);
    scheduleLedgerUpload(state);
  }, [state]);

  const ar = useMemo(() => totalReceivable(state), [state]);
  const ap = useMemo(() => totalPayable(state), [state]);
  const net = useMemo(() => round2(ar - ap), [ar, ap]);

  const overdueRecv = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const o of state.salesOrders) {
      const bal = salesBalance(state, o);
      if (bal > 0 && isDateBeforeToday(o.expectedRepaymentDate)) {
        sum += bal;
        n++;
      }
    }
    return { sum: round2(sum), n };
  }, [state]);

  const overduePay = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const o of state.purchaseOrders) {
      const bal = purchaseBalance(state, o);
      if (bal > 0 && isDateBeforeToday(o.dueDate)) {
        sum += bal;
        n++;
      }
    }
    return { sum: round2(sum), n };
  }, [state]);

  const sortedSales = useMemo(
    () => [...state.salesOrders].sort((a, b) => b.createdAt - a.createdAt),
    [state.salesOrders]
  );
  const sortedPurchases = useMemo(
    () => [...state.purchaseOrders].sort((a, b) => b.createdAt - a.createdAt),
    [state.purchaseOrders]
  );

  const [showQuickSale, setShowQuickSale] = useState(false);
  const customers = useMemo(() => uniqueCustomerNames(state), [state]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      <header className="flex-shrink-0 bg-emerald-600 px-3 py-1.5 shadow-md">
        <div className="grid grid-cols-4 gap-0.5 rounded-xl overflow-hidden bg-emerald-700/45 p-0.5">
          {(
            [
              ["overview", inv.overviewTab, LayoutDashboard],
              ["sales", inv.salesTab, ShoppingCart],
              ["stock", inv.stockTab, Package],
              ["purchase", inv.purchaseTab, Truck],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`py-1.5 px-0.5 rounded-lg flex flex-col items-center gap-0.5 transition-colors ${
                tab === key ? "bg-white text-emerald-700 shadow" : "text-white/90"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={tab === key ? 2.2 : 1.8} />
              <span className="text-[10px] font-medium leading-tight text-center line-clamp-1">{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
        {tab === "overview" && (
          <>
            <OverviewBody
              inv={inv}
              state={state}
              ar={ar}
              ap={ap}
              net={net}
              overdueRecv={overdueRecv}
              overduePay={overduePay}
              skuCount={state.products.length}
              salesOpen={state.salesOrders.filter((o) => salesBalance(state, o) > 0).length}
              purchaseOpen={state.purchaseOrders.filter((o) => purchaseBalance(state, o) > 0).length}
              language={language}
              onQuickSale={() => setShowQuickSale(true)}
            />
            {showQuickSale && (
              <SalesOrderEditor
                inv={inv}
                products={state.products}
                customers={customers}
                phoneLookup={(name) => customerPhoneLookup(state, name)}
                editOrder={null}
                ledgerState={state}
                onClose={() => setShowQuickSale(false)}
                onSave={(draft) => {
                  setState((s) => addSalesOrder(s, draft));
                  setShowQuickSale(false);
                }}
              />
            )}
          </>
        )}
        {tab === "sales" && (
          <SalesTab inv={inv} state={state} setState={setState} orders={sortedSales} language={language} />
        )}
        {tab === "stock" && <StockTab inv={inv} state={state} setState={setState} />}
        {tab === "purchase" && (
          <PurchaseTab inv={inv} state={state} setState={setState} orders={sortedPurchases} language={language} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════ Overview ═══════════════ */

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function OverviewBody({
  inv,
  state,
  ar,
  ap,
  net,
  overdueRecv,
  overduePay,
  skuCount,
  salesOpen,
  purchaseOpen,
  language,
  onQuickSale,
}: {
  inv: Inv;
  state: LedgerState;
  ar: number;
  ap: number;
  net: number;
  overdueRecv: { sum: number; n: number };
  overduePay: { sum: number; n: number };
  skuCount: number;
  salesOpen: number;
  purchaseOpen: number;
  language: string;
  onQuickSale: () => void;
}) {
  const fmt = useCallback((n: number) => fmtMoney(n, language), [language]);

  const salesGross = useMemo(() => totalSalesGross(state), [state]);
  const salesPd = useMemo(() => totalSalesPaid(state), [state]);
  const purchaseGross = useMemo(() => totalPurchaseGross(state), [state]);
  const purchasePd = useMemo(() => totalPurchasePaid(state), [state]);
  const custRanking = useMemo(() => customerReceivables(state), [state]);

  const tSales = useMemo(() => todaySalesTotal(state), [state]);
  const tCount = useMemo(() => todaySalesCount(state), [state]);
  const tProfit = useMemo(() => todayProfit(state), [state]);

  const arRate = salesGross > 0 ? Math.min(100, round2((salesPd / salesGross) * 100)) : 0;
  const apRate = purchaseGross > 0 ? Math.min(100, round2((purchasePd / purchaseGross) * 100)) : 0;

  return (
    <div className="p-3 space-y-3 pb-safe-nav relative">
      {/* Today / AR / AP — uniform white card style */}
      <div className="bg-white rounded-2xl p-4 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-gray-500">{inv.todayOverview}</p>
          {tCount > 0 && <span className="text-[10px] text-gray-400">{tCount}{inv.ordersUnit}</span>}
        </div>
        <div className="flex items-end gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400">{inv.todaySales}</p>
            <p className="text-xl font-bold text-gray-900 tabular-nums truncate">{fmt(tSales)}</p>
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-[10px] text-gray-400">{inv.todayProfit}</p>
            <p className={`text-xl font-bold tabular-nums truncate ${tProfit > 0 ? "text-emerald-600" : tProfit < 0 ? "text-red-500" : "text-gray-900"}`}>
              {fmt(tProfit)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm overflow-hidden">
        <p className="text-xs font-medium text-gray-500 truncate mb-1">{inv.arLabel}</p>
        <p className="text-xl font-bold text-emerald-600 tabular-nums">{fmt(ar)}</p>
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-gray-400">{inv.collectionProgress}</span>
            <span className="font-bold text-emerald-600 tabular-nums">{arRate}%</span>
          </div>
          <ProgressBar pct={arRate} color="bg-emerald-500" />
          <div className="flex justify-between text-[10px] text-gray-400 tabular-nums">
            <span>{inv.collected} {fmt(salesPd)}</span>
            <span>{inv.totalSalesAmount} {fmt(salesGross)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm overflow-hidden">
        <p className="text-xs font-medium text-gray-500 truncate mb-1">{inv.apLabel}</p>
        <p className="text-xl font-bold text-amber-600 tabular-nums">{fmt(ap)}</p>
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-gray-400">{inv.paymentProgress}</span>
            <span className="font-bold text-amber-600 tabular-nums">{apRate}%</span>
          </div>
          <ProgressBar pct={apRate} color="bg-amber-500" />
          <div className="flex justify-between text-[10px] text-gray-400 tabular-nums">
            <span>{inv.paidAmount} {fmt(purchasePd)}</span>
            <span>{inv.totalPurchaseAmount} {fmt(purchaseGross)}</span>
          </div>
        </div>
      </div>

      {/* Net */}
      <div className="bg-white rounded-2xl p-4 shadow-sm overflow-hidden">
        <p className="text-xs font-medium text-gray-500">{inv.netPosition}</p>
        <p className={`text-xl font-bold mt-0.5 tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {fmt(net)}
        </p>
        <p className="text-[11px] text-gray-400 mt-1 leading-snug break-words">{inv.netHint}</p>
      </div>

      {/* Overdue */}
      {(overdueRecv.n > 0 || overduePay.n > 0) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-amber-400 overflow-hidden">
          <div className="flex items-center gap-1.5 text-amber-700 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{inv.overdueTitle}</span>
          </div>
          {overdueRecv.n > 0 && (
            <p className="text-sm text-gray-700 truncate">
              {inv.overdueReceive}: <span className="font-semibold tabular-nums">{fmt(overdueRecv.sum)}</span> · {overdueRecv.n}{inv.ordersUnit}
            </p>
          )}
          {overduePay.n > 0 && (
            <p className="text-sm text-gray-700 mt-1 truncate">
              {inv.overduePay}: <span className="font-semibold tabular-nums">{fmt(overduePay.sum)}</span> · {overduePay.n}{inv.ordersUnit}
            </p>
          )}
        </div>
      )}

      {/* Customer ranking */}
      {custRanking.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm overflow-hidden">
          <p className="font-semibold text-gray-800 text-sm mb-2">{inv.customerRanking}</p>
          <div className="space-y-2">
            {custRanking.slice(0, 5).map((c) => (
              <div key={c.name} className="flex items-center gap-2 text-sm min-w-0">
                <div className="flex-1 min-w-0 flex items-baseline gap-1">
                  <span className="font-medium text-gray-900 truncate">{c.name}</span>
                  <span className="text-gray-400 text-[10px] shrink-0">({c.orderCount}{inv.ordersUnit})</span>
                </div>
                <span className="font-bold text-emerald-600 tabular-nums shrink-0 text-right">{fmt(c.balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="bg-white rounded-xl p-3 shadow-sm overflow-hidden">
          <p className="text-gray-400 text-[10px] truncate">{inv.skuCount}</p>
          <p className="font-bold text-gray-900 text-lg tabular-nums">{skuCount}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm overflow-hidden">
          <p className="text-gray-400 text-[10px] truncate">{inv.openSalesCount}</p>
          <p className="font-bold text-gray-900 text-lg tabular-nums">{salesOpen}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm overflow-hidden">
          <p className="text-gray-400 text-[10px] truncate">{inv.openPurchaseCount}</p>
          <p className="font-bold text-gray-900 text-lg tabular-nums">{purchaseOpen}</p>
        </div>
      </div>

      {/* Export */}
      {(state.salesOrders.length > 0 || state.purchaseOrders.length > 0 || state.products.length > 0) && (
        <button
          type="button"
          className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center justify-center gap-2 active:bg-gray-50 transition-colors"
          onClick={() => downloadCSV(exportAllCSV(state), `ledger_${todayISODate()}.csv`)}
        >
          <Download className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-semibold text-emerald-700 text-sm">{inv.exportData}</span>
        </button>
      )}

      {/* FAB — quick sale */}
      <button
        type="button"
        onClick={onQuickSale}
        className="fixed right-5 bottom-24 w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg flex items-center justify-center active:scale-95 active:bg-emerald-700 transition-transform z-30"
      >
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
}

/* ═══════════════ Status helpers ═══════════════ */

function salesStatus(state: LedgerState, o: SalesOrder): "paid" | "partial" | "unpaid" | "overdue" {
  const bal = salesBalance(state, o);
  if (bal <= 0.001) return "paid";
  const partial = salesPaidTotal(state, o.id) > 0.001;
  if (isDateBeforeToday(o.expectedRepaymentDate)) return "overdue";
  if (partial) return "partial";
  return "unpaid";
}

function purchaseStatus(state: LedgerState, o: PurchaseOrder): "paid" | "partial" | "unpaid" | "overdue" {
  const bal = purchaseBalance(state, o);
  if (bal <= 0.001) return "paid";
  const partial = purchasePaidTotal(state, o.id) > 0.001;
  if (isDateBeforeToday(o.dueDate)) return "overdue";
  if (partial) return "partial";
  return "unpaid";
}

function StatusBadge({ kind, inv }: { kind: "paid" | "partial" | "unpaid" | "overdue"; inv: Inv }) {
  const map = {
    paid: { t: inv.statusPaid, c: "bg-emerald-100 text-emerald-800" },
    partial: { t: inv.statusPartial, c: "bg-blue-100 text-blue-800" },
    unpaid: { t: inv.statusUnpaid, c: "bg-gray-100 text-gray-700" },
    overdue: { t: inv.statusOverdue, c: "bg-red-100 text-red-800" },
  }[kind];
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${map.c}`}>{map.t}</span>;
}

/* ═══════════════ Filter chips ═══════════════ */

function FilterChips({ inv, value, onChange }: { inv: Inv; value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const chips: Array<{ key: StatusFilter; label: string; active: string }> = [
    { key: "all", label: inv.filterAll, active: "bg-emerald-600 text-white" },
    { key: "unpaid", label: inv.statusUnpaid, active: "bg-gray-700 text-white" },
    { key: "partial", label: inv.statusPartial, active: "bg-blue-600 text-white" },
    { key: "overdue", label: inv.statusOverdue, active: "bg-red-600 text-white" },
    { key: "paid", label: inv.statusPaid, active: "bg-emerald-600 text-white" },
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
            value === c.key ? c.active : "bg-gray-100 text-gray-600"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════ Order card ═══════════════ */

function SalesCard({ o, state, inv, fmt, onClick }: { o: SalesOrder; state: LedgerState; inv: Inv; fmt: (n: number) => string; onClick: () => void }) {
  const bal = salesBalance(state, o);
  const st = salesStatus(state, o);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start bg-gray-50 rounded-xl p-3 border border-gray-100 active:bg-emerald-50 overflow-hidden"
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate text-[15px]">{o.customerName}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums truncate">
            {o.orderDate} → {o.expectedRepaymentDate}
          </p>
        </div>
        <StatusBadge kind={st} inv={inv} />
      </div>
      <div className="flex items-center justify-between mt-2 gap-2 min-w-0">
        <span className="text-sm text-gray-500 truncate">
          {inv.balance} <span className="font-bold text-emerald-700 tabular-nums">{fmt(bal)}</span>
        </span>
        <span className="text-xs text-gray-400 tabular-nums shrink-0">
          / {fmt(o.totalAmount)}
        </span>
      </div>
    </button>
  );
}

function PurchaseCard({ o, state, inv, fmt, onClick }: { o: PurchaseOrder; state: LedgerState; inv: Inv; fmt: (n: number) => string; onClick: () => void }) {
  const bal = purchaseBalance(state, o);
  const st = purchaseStatus(state, o);
  const itemSummary = o.items.map((l) => l.name).filter(Boolean).join("、");
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start bg-gray-50 rounded-xl p-3 border border-gray-100 active:bg-emerald-50 overflow-hidden"
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate text-[15px]">{itemSummary || inv.newPurchaseOrder}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 tabular-nums truncate">
            {o.orderDate} → {o.dueDate}
            {o.termsNote ? <span className="text-amber-500 ml-1.5">({o.termsNote})</span> : null}
          </p>
        </div>
        <StatusBadge kind={st} inv={inv} />
      </div>
      <div className="flex items-center justify-between mt-2 gap-2 min-w-0">
        <span className="text-sm text-gray-500 truncate">
          {inv.balance} <span className="font-bold text-amber-700 tabular-nums">{fmt(bal)}</span>
        </span>
        <span className="text-xs text-gray-400 tabular-nums shrink-0">
          / {fmt(o.totalAmount)}
        </span>
      </div>
    </button>
  );
}

/* ═══════════════ FAB menu (shared) ═══════════════ */

function FabMenu({
  upLabel,
  downLabel,
  onUp,
  onDown,
}: {
  upLabel: string;
  downLabel: string;
  onUp: () => void;
  onDown: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/20"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      )}
      <div className="fixed right-5 bottom-24 z-40 flex flex-col items-end gap-3">
        {open && (
          <>
            <button
              type="button"
              onClick={() => { setOpen(false); onUp(); }}
              className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full bg-emerald-600 text-white shadow-lg text-sm font-medium active:scale-95 transition-transform"
            >
              {upLabel}
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onDown(); }}
              className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full bg-red-500 text-white shadow-lg text-sm font-medium active:scale-95 transition-transform"
            >
              {downLabel}
              <ArrowDownLeft className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all ${
            open ? "bg-gray-600 rotate-45" : "bg-emerald-600"
          } text-white`}
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>
    </>
  );
}

/* ═══════════════ Sales tab ═══════════════ */

function SalesTab({
  inv,
  state,
  setState,
  orders,
  language,
}: {
  inv: Inv;
  state: LedgerState;
  setState: Dispatch<SetStateAction<LedgerState>>;
  orders: SalesOrder[];
  language: string;
}) {
  const fmt = useCallback((n: number) => fmtMoney(n, language), [language]);
  const [showNew, setShowNew] = useState(false);
  const [editOrder, setEditOrder] = useState<SalesOrder | null>(null);
  const [detail, setDetail] = useState<SalesOrder | null>(null);
  const [payOrder, setPayOrder] = useState<SalesOrder | null>(null);
  const [returnOrder, setReturnOrder] = useState<SalesOrder | null>(null);
  const [pickReturn, setPickReturn] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) => o.customerName.toLowerCase().includes(q) || o.customerPhone.includes(q) || o.note.toLowerCase().includes(q)
      );
    }
    if (filter !== "all") {
      list = list.filter((o) => salesStatus(state, o) === filter);
    }
    return list;
  }, [orders, search, filter, state]);

  const customers = useMemo(() => uniqueCustomerNames(state), [state]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-3 pt-3 pb-1 space-y-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 text-sm placeholder:text-gray-400 outline-none"
            placeholder={inv.searchCustomer}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterChips inv={inv} value={filter} onChange={setFilter} />
      </div>
      <div className="flex-1 p-3 space-y-2 pb-20">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-14">
            {orders.length === 0 ? inv.noSalesOrders : inv.noResults}
          </p>
        ) : (
          filtered.map((o) => (
            <SalesCard key={o.id} o={o} state={state} inv={inv} fmt={fmt} onClick={() => setDetail(o)} />
          ))
        )}
      </div>
      <FabMenu
        upLabel={inv.fabNewSale}
        downLabel={inv.fabSalesReturn}
        onUp={() => setShowNew(true)}
        onDown={() => {
          if (orders.length === 0) { alert(inv.noSalesOrders); return; }
          setPickReturn(true);
        }}
      />
      {(showNew || editOrder) && (
        <SalesOrderEditor
          inv={inv}
          products={state.products}
          customers={customers}
          phoneLookup={(name) => customerPhoneLookup(state, name)}
          editOrder={editOrder}
          ledgerState={state}
          onClose={() => { setShowNew(false); setEditOrder(null); }}
          onSave={(draft) => {
            if (editOrder) setState((s) => editSalesOrder(s, editOrder.id, draft));
            else setState((s) => addSalesOrder(s, draft));
            setShowNew(false);
            setEditOrder(null);
          }}
        />
      )}
      {detail && (
        <SalesOrderDetail
          inv={inv}
          state={state}
          order={detail}
          fmt={fmt}
          onClose={() => setDetail(null)}
          onPay={() => { setPayOrder(detail); setDetail(null); }}
          onEdit={() => { setEditOrder(detail); setDetail(null); }}
          onDelete={() => {
            if (window.confirm(inv.confirmDeleteOrder + (detail.stockOutApplied ? "\n" + inv.stockRollbackHint : ""))) {
              setState((s) => deleteSalesOrder(s, detail.id));
              setDetail(null);
            }
          }}
          onStockOut={() => {
            const res = applySalesStockOut(state, detail.id);
            if (res.error === "already") alert(inv.stockAlreadyApplied);
            else if (res.error?.startsWith("short:")) alert(`${inv.stockInsufficient}: ${res.error.slice(6)}`);
            else { setState(res.state); setDetail(null); }
          }}
          onReturn={() => { setReturnOrder(detail); setDetail(null); }}
        />
      )}
      {payOrder && (
        <PaymentSheet
          inv={inv}
          title={inv.recordSalesPayment}
          balance={salesBalance(state, payOrder)}
          fmt={fmt}
          onClose={() => setPayOrder(null)}
          onSubmit={(amount, note, payMethod) => { setState((s) => addSalesPayment(s, payOrder.id, amount, note, payMethod)); setPayOrder(null); }}
        />
      )}
      {returnOrder && (
        <ReturnSheet
          inv={inv}
          orderItems={returnOrder.items}
          fmt={fmt}
          onClose={() => setReturnOrder(null)}
          onSubmit={(items, note, returnStock) => {
            setState((s) => addSalesReturn(s, returnOrder.id, items, note, returnStock));
            setReturnOrder(null);
          }}
        />
      )}
      {pickReturn && (
        <OrderPickerSheet
          title={inv.selectReturnOrder}
          items={orders.map((o) => ({ id: o.id, label: `${o.customerName} · ${fmt(o.totalAmount)}`, sub: o.orderDate }))}
          onClose={() => setPickReturn(false)}
          onPick={(id) => {
            const o = orders.find((x) => x.id === id);
            if (o) { setReturnOrder(o); setPickReturn(false); }
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════ Purchase tab ═══════════════ */

function PurchaseTab({
  inv,
  state,
  setState,
  orders,
  language,
}: {
  inv: Inv;
  state: LedgerState;
  setState: Dispatch<SetStateAction<LedgerState>>;
  orders: PurchaseOrder[];
  language: string;
}) {
  const fmt = useCallback((n: number) => fmtMoney(n, language), [language]);
  const [showNew, setShowNew] = useState(false);
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null);
  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [payOrder, setPayOrder] = useState<PurchaseOrder | null>(null);
  const [returnOrder, setReturnOrder] = useState<PurchaseOrder | null>(null);
  const [pickReturn, setPickReturn] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) => o.termsNote.toLowerCase().includes(q) || o.note.toLowerCase().includes(q) ||
          o.items.some((l) => l.name.toLowerCase().includes(q))
      );
    }
    if (filter !== "all") {
      list = list.filter((o) => purchaseStatus(state, o) === filter);
    }
    return list;
  }, [orders, search, filter, state]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-3 pt-3 pb-1 space-y-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 text-sm placeholder:text-gray-400 outline-none"
            placeholder={inv.searchPurchase}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterChips inv={inv} value={filter} onChange={setFilter} />
      </div>
      <div className="flex-1 p-3 space-y-2 pb-20">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-14">
            {orders.length === 0 ? inv.noPurchaseOrders : inv.noResults}
          </p>
        ) : (
          filtered.map((o) => (
            <PurchaseCard key={o.id} o={o} state={state} inv={inv} fmt={fmt} onClick={() => setDetail(o)} />
          ))
        )}
      </div>
      <FabMenu
        upLabel={inv.fabNewPurchase}
        downLabel={inv.fabPurchaseReturn}
        onUp={() => setShowNew(true)}
        onDown={() => {
          if (orders.length === 0) { alert(inv.noPurchaseOrders); return; }
          setPickReturn(true);
        }}
      />
      {(showNew || editOrder) && (
        <PurchaseOrderEditor
          inv={inv}
          products={state.products}
          editOrder={editOrder}
          onClose={() => { setShowNew(false); setEditOrder(null); }}
          onSave={(draft) => {
            if (editOrder) {
              setState((s) => editPurchaseOrder(s, editOrder.id, draft));
            } else {
              setState((s) => {
                const s2 = addPurchaseOrder(s, draft);
                const newOrder = s2.purchaseOrders[0];
                return applyPurchaseStockIn(s2, newOrder.id);
              });
            }
            setShowNew(false);
            setEditOrder(null);
          }}
        />
      )}
      {detail && (
        <PurchaseOrderDetail
          inv={inv}
          state={state}
          order={detail}
          fmt={fmt}
          onClose={() => setDetail(null)}
          onPay={() => { setPayOrder(detail); setDetail(null); }}
          onEdit={() => { setEditOrder(detail); setDetail(null); }}
          onDelete={() => {
            if (window.confirm(inv.confirmDeleteOrder + (detail.stockInApplied ? "\n" + inv.stockRollbackHint : ""))) {
              setState((s) => {
                const res = deletePurchaseOrder(s, detail.id);
                if (res.negativeWarnings.length > 0) {
                  alert(inv.negativeStockWarning + "\n" + res.negativeWarnings.join("\n"));
                }
                return res.state;
              });
              setDetail(null);
            }
          }}
          onStockIn={() => {
            if (detail.stockInApplied) { alert(inv.stockAlreadyApplied); return; }
            setState((s) => applyPurchaseStockIn(s, detail.id));
            setDetail(null);
          }}
          onReturn={() => { setReturnOrder(detail); setDetail(null); }}
        />
      )}
      {returnOrder && (
        <ReturnSheet
          inv={inv}
          orderItems={returnOrder.items}
          fmt={fmt}
          onClose={() => setReturnOrder(null)}
          onSubmit={(items, note, returnStock) => {
            setState((s) => addPurchaseReturn(s, returnOrder.id, items, note, returnStock));
            setReturnOrder(null);
          }}
        />
      )}
      {pickReturn && (
        <OrderPickerSheet
          title={inv.selectReturnOrder}
          items={orders.map((o) => ({
            id: o.id,
            label: o.items.map((l) => l.name).join(", ") || "—",
            sub: `${o.orderDate} · ${fmt(o.totalAmount)}`,
          }))}
          onClose={() => setPickReturn(false)}
          onPick={(id) => {
            const o = orders.find((x) => x.id === id);
            if (o) { setReturnOrder(o); setPickReturn(false); }
          }}
        />
      )}
      {payOrder && (
        <PaymentSheet
          inv={inv}
          title={inv.recordPurchasePayment}
          balance={purchaseBalance(state, payOrder)}
          fmt={fmt}
          onClose={() => setPayOrder(null)}
          onSubmit={(amount, note, payMethod) => { setState((s) => addPurchasePayment(s, payOrder.id, amount, note, payMethod)); setPayOrder(null); }}
        />
      )}
    </div>
  );
}

/* ═══════════════ Payment sheet ═══════════════ */

const PAY_METHODS = ["cash", "transfer", "wechat", "alipay", "credit", "other"] as const;
type PayMethodUI = typeof PAY_METHODS[number];

function payMethodLabel(inv: Inv, m: PayMethodUI): string {
  const map: Record<PayMethodUI, string> = {
    cash: inv.payMethodCash, transfer: inv.payMethodTransfer, wechat: inv.payMethodWechat,
    alipay: inv.payMethodAlipay, credit: inv.payMethodCredit, other: inv.payMethodOther,
  };
  return map[m] || m;
}

function PaymentSheet({
  inv,
  title,
  balance,
  fmt,
  onClose,
  onSubmit,
}: {
  inv: Inv;
  title: string;
  balance: number;
  fmt: (n: number) => string;
  onClose: () => void;
  onSubmit: (amount: number, note: string, payMethod: PayMethodUI) => void;
}) {
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PayMethodUI>("cash");
  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700"
          onClick={() => {
            const a = round2(parseFloat(amt) || 0);
            if (a <= 0 || a > balance + 0.001) { alert(inv.invalidPayAmount); return; }
            onSubmit(a, note, method);
          }}
        >
          {inv.save}
        </button>
      }
    >
      <p className="text-sm text-gray-600 mb-3">
        {inv.remainingBalance}: <span className="font-semibold tabular-nums">{fmt(balance)}</span>
      </p>
      <label className="text-xs text-gray-500">{inv.paymentAmount}</label>
      <input
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 mb-3 text-base outline-none focus:border-emerald-500"
        inputMode="decimal"
        value={amt}
        onChange={(e) => setAmt(sanitizeNum(e.target.value))}
      />
      <label className="text-xs text-gray-500">{inv.payMethod}</label>
      <div className="flex flex-wrap gap-1.5 mt-1 mb-3">
        {PAY_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              method === m ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 active:bg-gray-50"
            }`}
          >
            {payMethodLabel(inv, m)}
          </button>
        ))}
      </div>
      <label className="text-xs text-gray-500">{inv.note}</label>
      <input
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 mb-2 text-base outline-none focus:border-emerald-500"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </BottomSheet>
  );
}

/* ═══════════════ Order picker sheet ═══════════════ */

function OrderPickerSheet({
  title,
  items,
  onClose,
  onPick,
}: {
  title: string;
  items: Array<{ id: string; label: string; sub: string }>;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const lc = q.trim().toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(lc) || i.sub.toLowerCase().includes(lc));
  }, [items, q]);

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 text-sm placeholder:text-gray-400 outline-none"
          placeholder="搜索..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="space-y-1.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">无匹配结果</p>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPick(item.id)}
              className="w-full text-left p-3 rounded-xl border border-gray-100 bg-gray-50 active:bg-emerald-50 overflow-hidden"
            >
              <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
              <p className="text-xs text-gray-500 truncate">{item.sub}</p>
            </button>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

/* ═══════════════ Stock adjustment sheet ═══════════════ */

function StockAdjustSheet({
  inv,
  product,
  onClose,
  onSave,
}: {
  inv: Inv;
  product: Product;
  onClose: () => void;
  onSave: (delta: number) => void;
}) {
  const [qty, setQty] = useState("");
  const num = Math.abs(Number(qty) || 0);
  const afterQty = round2(product.qtyOnHand - num);
  return (
    <BottomSheet
      title={inv.stockAdjustTitle}
      onClose={onClose}
      footer={
        <div>
          {num > 0 && (
            <p className={`text-xs mb-2 ${afterQty < 0 ? "text-red-500" : "text-gray-500"}`}>
              {inv.qtyOnHand}: {formatQty(product.qtyOnHand)} → {formatQty(afterQty)} {product.unit}
            </p>
          )}
          <button
            type="button"
            disabled={num <= 0}
            onClick={() => onSave(-num)}
            className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold active:bg-red-600 disabled:opacity-40"
          >
            {inv.save}
          </button>
        </div>
      }
    >
      <div className="text-sm text-gray-700 mb-2">
        <span className="font-medium">{product.name}</span>
        <span className="text-gray-400 ml-2">{inv.qtyOnHand}: {formatQty(product.qtyOnHand)} {product.unit}</span>
      </div>
      <label className="text-xs text-gray-500">{inv.stockAdjustQty}</label>
      <div className="flex items-center gap-2 mt-0.5 mb-2">
        <span className="text-red-500 font-bold text-lg shrink-0">−</span>
        <input
          inputMode="decimal"
          className={inputCls + " !mb-0"}
          value={qty}
          onChange={(e) => setQty(sanitizeNum(e.target.value))}
          placeholder="0"
        />
        <span className="text-gray-400 text-sm shrink-0">{product.unit}</span>
      </div>
    </BottomSheet>
  );
}

/* ═══════════════ Return sheet (shared) ═══════════════ */

function ReturnSheet({
  inv,
  orderItems,
  fmt,
  onClose,
  onSubmit,
}: {
  inv: Inv;
  orderItems: OrderLine[];
  fmt: (n: number) => string;
  onClose: () => void;
  onSubmit: (items: OrderLine[], note: string, returnStock: boolean) => void;
}) {
  const [lines, setLines] = useState<OrderLine[]>(() =>
    orderItems.map((l) => ({ ...l, qty: 0, lineTotal: 0 }))
  );
  const [note, setNote] = useState("");
  const [returnStock, setReturnStock] = useState(true);

  const total = useMemo(() => sumLineTotals(lines), [lines]);
  const hasQty = lines.some((l) => l.qty > 0);

  return (
    <BottomSheet
      title={inv.returnLabel}
      onClose={onClose}
      footer={
        <div>
          {hasQty && (
            <div className="text-sm font-semibold text-orange-600 text-right mb-2">
              {inv.returnTotalLabel}: {fmt(total)}
            </div>
          )}
          <button
            type="button"
            disabled={!hasQty}
            onClick={() => {
              const filtered = lines.filter((l) => l.qty > 0);
              onSubmit(filtered, note, returnStock);
            }}
            className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold active:bg-orange-600 disabled:opacity-40"
          >
            {inv.confirmReturn}
          </button>
        </div>
      }
    >
      <p className="text-xs text-gray-500 mb-3">{inv.returnHint}</p>
      <div className="space-y-3 mb-3">
        {lines.map((line, i) => {
          const orig = orderItems[i];
          return (
            <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-1.5">
              <div className="text-sm font-medium text-gray-800 truncate">{orig.name}</div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{inv.returnMaxQty}: {orig.qty}</span>
                <span>@{fmt(orig.unitPrice)}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 shrink-0">{inv.returnQty}</label>
                <input
                  inputMode="decimal"
                  className={inputCls + " !mb-0"}
                  value={line.qty || ""}
                  onChange={(e) => {
                    const q = Math.min(Math.max(0, Number(sanitizeNum(e.target.value)) || 0), orig.qty);
                    setLines((ls) => ls.map((l, j) =>
                      j === i ? recalcLine({ ...l, qty: q, unitPrice: orig.unitPrice }) : l
                    ));
                  }}
                />
              </div>
              {line.qty > 0 && (
                <div className="text-xs text-orange-600 font-medium text-right">
                  {inv.returnSubtotal}: {fmt(line.lineTotal)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <label className="text-xs text-gray-500">{inv.note}</label>
      <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 cursor-pointer">
        <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} className="rounded" />
        {inv.returnStockBack}
      </label>
    </BottomSheet>
  );
}

/* ═══════════════ Sales order detail ═══════════════ */

function SalesOrderDetail({
  inv,
  state,
  order,
  fmt,
  onClose,
  onPay,
  onEdit,
  onDelete,
  onStockOut,
  onReturn,
}: {
  inv: Inv;
  state: LedgerState;
  order: SalesOrder;
  fmt: (n: number) => string;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStockOut: () => void;
  onReturn: () => void;
}) {
  const pays = state.salesPayments.filter((p) => p.salesOrderId === order.id).sort((a, b) => b.paidAt - a.paidAt);
  const returns = (state.salesReturns || []).filter((r) => r.salesOrderId === order.id).sort((a, b) => b.createdAt - a.createdAt);
  const retTotal = salesReturnTotal(state, order.id);
  const bal = salesBalance(state, order);
  return (
    <BottomSheet
      title={inv.orderDetail}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {bal > 0.001 && (
            <button type="button" onClick={onPay} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700">
              {inv.recordSalesPayment}
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onReturn} className="flex-1 py-2 rounded-xl border border-orange-200 text-orange-600 text-sm flex items-center justify-center gap-1.5 active:bg-orange-50">
              <RotateCcw className="w-3.5 h-3.5" />{inv.returnLabel}
            </button>
            <button type="button" onClick={onEdit} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm flex items-center justify-center gap-1.5 active:bg-gray-50">
              <Pencil className="w-3.5 h-3.5" />{inv.editOrder}
            </button>
            <button type="button" onClick={onDelete} className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-sm flex items-center justify-center gap-1.5 active:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" />{inv.deleteOrder}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-1.5 text-sm mb-3">
        <div className="flex gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{inv.customerName}</span>
          <span className="text-gray-900 font-medium truncate">{order.customerName}</span>
        </div>
        {order.customerPhone ? (
          <div className="flex gap-2 min-w-0">
            <span className="text-gray-400 shrink-0">{inv.customerPhone}</span>
            <span className="text-gray-900 truncate">{order.customerPhone}</span>
          </div>
        ) : null}
        <div className="flex gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{inv.expectedRepayment}</span>
          <span className="text-gray-900 tabular-nums">{order.expectedRepaymentDate}</span>
        </div>
        <div className="flex gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{inv.balance}</span>
          <span className="tabular-nums">
            <strong className="text-emerald-700">{fmt(bal)}</strong>
            <span className="text-gray-400 mx-1">/</span>
            <span className="text-gray-600">{fmt(order.totalAmount)}</span>
            {retTotal > 0 && <span className="text-orange-500 text-xs ml-1">(-{fmt(retTotal)} {inv.returnLabel})</span>}
          </span>
        </div>
        {order.stockOutApplied ? (
          <p className="text-emerald-600 text-xs">{inv.stockOutDone}</p>
        ) : (
          <button type="button" onClick={onStockOut} className="text-sm text-emerald-700 font-medium underline">
            {inv.confirmStockOut}
          </button>
        )}
      </div>
      <p className="font-semibold text-gray-800 text-sm mb-1">{inv.lineItems}</p>
      <div className="text-sm space-y-1 mb-3 border border-gray-100 rounded-lg p-2 bg-gray-50 overflow-hidden">
        {order.items.map((l, i) => (
          <div key={i} className="flex justify-between gap-2 min-w-0">
            <span className="truncate text-gray-700">{l.name}</span>
            <span className="tabular-nums text-gray-500 shrink-0 text-xs">
              {l.qty}×{fmt(l.unitPrice)}={fmt(l.lineTotal)}
            </span>
          </div>
        ))}
      </div>
      {returns.length > 0 && (
        <>
          <p className="font-semibold text-gray-800 text-sm mb-1">{inv.returnHistory}</p>
          <div className="text-sm space-y-2 mb-3 max-h-28 overflow-y-auto">
            {returns.map((r) => (
              <div key={r.id} className="border-b border-orange-100 pb-2">
                <div className="font-medium tabular-nums text-orange-600">-{fmt(r.totalAmount)}</div>
                <div className="text-[11px] text-gray-500">{r.returnDate}{r.stockReturned ? ` · ${inv.stockReturned}` : ""}</div>
                {r.note ? <div className="text-xs text-gray-600 truncate">{r.note}</div> : null}
              </div>
            ))}
          </div>
        </>
      )}
      <p className="font-semibold text-gray-800 text-sm mb-1">{inv.paymentHistory}</p>
      {pays.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">{inv.noPayments}</p>
      ) : (
        <div className="text-sm space-y-2 mb-3 max-h-36 overflow-y-auto">
          {pays.map((p) => (
            <div key={p.id} className="border-b border-gray-100 pb-2">
              <div className="flex items-baseline gap-2">
                <span className="font-medium tabular-nums">{fmt(p.amount)}</span>
                {p.payMethod && p.payMethod !== "cash" && (
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{payMethodLabel(inv, p.payMethod)}</span>
                )}
              </div>
              <div className="text-[11px] text-gray-500">{new Date(p.paidAt).toLocaleString()}</div>
              {p.note ? <div className="text-xs text-gray-600 truncate">{p.note}</div> : null}
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

/* ═══════════════ Purchase order detail ═══════════════ */

function PurchaseOrderDetail({
  inv,
  state,
  order,
  fmt,
  onClose,
  onPay,
  onEdit,
  onDelete,
  onStockIn,
  onReturn,
}: {
  inv: Inv;
  state: LedgerState;
  order: PurchaseOrder;
  fmt: (n: number) => string;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStockIn: () => void;
  onReturn: () => void;
}) {
  const pays = state.purchasePayments.filter((p) => p.purchaseOrderId === order.id).sort((a, b) => b.paidAt - a.paidAt);
  const returns = (state.purchaseReturns || []).filter((r) => r.purchaseOrderId === order.id).sort((a, b) => b.createdAt - a.createdAt);
  const retTotal = purchaseReturnTotal(state, order.id);
  const bal = purchaseBalance(state, order);
  return (
    <BottomSheet
      title={inv.purchaseDetail}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {bal > 0.001 && (
            <button type="button" onClick={onPay} className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold active:bg-amber-600">
              {inv.recordPurchasePayment}
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onReturn} className="flex-1 py-2 rounded-xl border border-orange-200 text-orange-600 text-sm flex items-center justify-center gap-1.5 active:bg-orange-50">
              <RotateCcw className="w-3.5 h-3.5" />{inv.returnLabel}
            </button>
            <button type="button" onClick={onEdit} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm flex items-center justify-center gap-1.5 active:bg-gray-50">
              <Pencil className="w-3.5 h-3.5" />{inv.editOrder}
            </button>
            <button type="button" onClick={onDelete} className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-sm flex items-center justify-center gap-1.5 active:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" />{inv.deleteOrder}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-1.5 text-sm mb-3">
        <div className="flex gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{inv.orderDate}</span>
          <span className="text-gray-900 tabular-nums">{order.orderDate}</span>
        </div>
        <div className="flex gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{inv.dueDate}</span>
          <span className="text-gray-900 tabular-nums">{order.dueDate}</span>
          {order.termsNote ? <span className="text-amber-500 text-xs">({order.termsNote})</span> : null}
        </div>
        <div className="flex gap-2 min-w-0">
          <span className="text-gray-400 shrink-0">{inv.balance}</span>
          <span className="tabular-nums">
            <strong className="text-amber-700">{fmt(bal)}</strong>
            <span className="text-gray-400 mx-1">/</span>
            <span className="text-gray-600">{fmt(order.totalAmount)}</span>
            {retTotal > 0 && <span className="text-orange-500 text-xs ml-1">(-{fmt(retTotal)} {inv.returnLabel})</span>}
          </span>
        </div>
        {order.stockInApplied ? (
          <p className="text-emerald-600 text-xs">{inv.stockInDone}</p>
        ) : (
          <button type="button" onClick={onStockIn} className="text-sm text-emerald-700 font-medium underline">
            {inv.confirmStockIn}
          </button>
        )}
      </div>
      <p className="font-semibold text-gray-800 text-sm mb-1">{inv.lineItems}</p>
      <div className="text-sm space-y-1 mb-3 border border-gray-100 rounded-lg p-2 bg-gray-50 overflow-hidden">
        {order.items.map((l, i) => (
          <div key={i} className="flex justify-between gap-2 min-w-0">
            <span className="truncate text-gray-700">{l.name}</span>
            <span className="tabular-nums text-gray-500 shrink-0 text-xs">
              {l.qty}×{fmt(l.unitPrice)}={fmt(l.lineTotal)}
            </span>
          </div>
        ))}
      </div>
      {returns.length > 0 && (
        <>
          <p className="font-semibold text-gray-800 text-sm mb-1">{inv.returnHistory}</p>
          <div className="text-sm space-y-2 mb-3 max-h-28 overflow-y-auto">
            {returns.map((r) => (
              <div key={r.id} className="border-b border-orange-100 pb-2">
                <div className="font-medium tabular-nums text-orange-600">-{fmt(r.totalAmount)}</div>
                <div className="text-[11px] text-gray-500">{r.returnDate}{r.stockReturned ? ` · ${inv.stockReturned}` : ""}</div>
                {r.note ? <div className="text-xs text-gray-600 truncate">{r.note}</div> : null}
              </div>
            ))}
          </div>
        </>
      )}
      <p className="font-semibold text-gray-800 text-sm mb-1">{inv.paymentHistory}</p>
      {pays.length === 0 ? (
        <p className="text-xs text-gray-400 mb-3">{inv.noPayments}</p>
      ) : (
        <div className="text-sm space-y-2 mb-3 max-h-36 overflow-y-auto">
          {pays.map((p) => (
            <div key={p.id} className="border-b border-gray-100 pb-2">
              <div className="flex items-baseline gap-2">
                <span className="font-medium tabular-nums">{fmt(p.amount)}</span>
                {p.payMethod && p.payMethod !== "cash" && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{payMethodLabel(inv, p.payMethod)}</span>
                )}
              </div>
              <div className="text-[11px] text-gray-500">{new Date(p.paidAt).toLocaleString()}</div>
              {p.note ? <div className="text-xs text-gray-600 truncate">{p.note}</div> : null}
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

/* ═══════════════ Form input helper ═══════════════ */

/* ═══════════════ Order line editor ═══════════════ */

function emptyLine(): OrderLine {
  return { productId: null, name: "", sku: "", unit: "件", qty: 1, unitPrice: 0, unitCost: 0, lineTotal: 0 };
}

function LineEditor({
  inv,
  line,
  index,
  products,
  canRemove,
  costMode,
  ledgerState,
  onUpdate,
  onRemove,
}: {
  inv: Inv;
  line: OrderLine;
  index: number;
  products: Product[];
  canRemove: boolean;
  costMode?: boolean;
  ledgerState?: LedgerState;
  onUpdate: (i: number, patch: Partial<OrderLine>) => void;
  onRemove: (i: number) => void;
}) {
  const pickProduct = (pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    const patch: Partial<OrderLine> = { productId: p.id, name: p.name, sku: p.sku, unit: p.unit };
    if (!costMode && ledgerState) {
      const cost = fifoCostPrice(ledgerState, p.id);
      if (cost > 0) patch.unitCost = cost;
    }
    onUpdate(index, patch);
  };
  const showCost = !costMode;
  return (
    <div className="border border-gray-200 rounded-xl p-2.5 mb-2 space-y-2 bg-gray-50 overflow-hidden">
      {products.length > 0 && (
        <select
          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white outline-none box-border"
          value={line.productId || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v) pickProduct(v);
            else onUpdate(index, { productId: null });
          }}
        >
          <option value="">{inv.pickProduct}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.spec ? ` ${p.spec}` : ""} ({p.qtyOnHand}{p.unit})
            </option>
          ))}
        </select>
      )}
      <input
        placeholder={inv.lineName}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none box-border"
        value={line.name}
        onChange={(e) => onUpdate(index, { name: e.target.value })}
      />
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-[10px] text-gray-400">{inv.lineQty}</label>
          <input
            placeholder={inv.lineQty}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none box-border"
            inputMode="decimal"
            value={String(line.qty)}
            onChange={(e) => { const v = sanitizeNum(e.target.value); onUpdate(index, { qty: parseFloat(v) || 0 }); }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-[10px] text-gray-400">{costMode ? inv.lineCost : inv.linePrice}</label>
          <input
            placeholder={costMode ? inv.lineCost : inv.linePrice}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none box-border"
            inputMode="decimal"
            value={String(line.unitPrice)}
            onChange={(e) => { const v = sanitizeNum(e.target.value); onUpdate(index, { unitPrice: parseFloat(v) || 0 }); }}
          />
        </div>
        {showCost && (
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-gray-400">{inv.unitCostLabel}</label>
            <input
              placeholder={inv.unitCostLabel}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none box-border"
              inputMode="decimal"
              value={String(line.unitCost || "")}
              onChange={(e) => { const v = sanitizeNum(e.target.value); onUpdate(index, { unitCost: parseFloat(v) || 0 }); }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between bg-white rounded-lg px-2 py-1.5 border border-gray-100">
        <span className="text-xs text-gray-400 tabular-nums">
          {line.qty} × {(line.unitPrice || 0).toFixed(2)}
        </span>
        <span className="text-sm font-bold text-gray-800 tabular-nums">
          = {sumLineTotals([line]).toFixed(2)}
        </span>
      </div>
      <div className="flex justify-between items-center">
        {canRemove ? (
          <button type="button" className="text-red-500 text-xs active:text-red-700" onClick={() => onRemove(index)}>
            {inv.removeLine}
          </button>
        ) : <span />}
      </div>
    </div>
  );
}

/* ═══════════════ Term day helpers ═══════════════ */

const TERM_DAYS = [7, 15, 30, 60, 90, 180] as const;

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function diffDays(from: string, to: string): number {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function TermChips({ inv, orderDate, termDays, customDue, onTermChange, onCustomDueChange }: {
  inv: Inv;
  orderDate: string;
  termDays: number;
  customDue: string;
  onTermChange: (d: number) => void;
  onCustomDueChange: (d: string) => void;
}) {
  const dueDate = termDays === -1 ? (customDue || orderDate) : addDays(orderDate, termDays);
  return (
    <>
      <label className="text-xs text-gray-500">{inv.paymentTerms}</label>
      <div className="flex flex-wrap gap-1.5 mt-0.5 mb-2">
        {TERM_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onTermChange(d)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              termDays === d ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
            }`}
          >
            {d}{inv.termDayUnit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onTermChange(-1)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            termDays === -1 ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
          }`}
        >
          {inv.termCustom}
        </button>
      </div>
      {termDays === -1 && (
        <>
          <label className="text-xs text-gray-500">{inv.dueDate}</label>
          <input type="date" className={dateInputCls} value={customDue} onChange={(e) => onCustomDueChange(e.target.value)} />
        </>
      )}
      <div className="bg-emerald-50 rounded-lg px-3 py-2 mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-500">{inv.dueDate}</span>
        <span className="text-sm font-semibold text-emerald-700 tabular-nums">{dueDate}</span>
      </div>
    </>
  );
}

function useTermState(orderDate: string, existingDueDate: string) {
  const initDiff = diffDays(orderDate, existingDueDate);
  const initTerm = (TERM_DAYS as readonly number[]).includes(initDiff) ? initDiff : (initDiff > 0 ? -1 : 0);
  const [termDays, setTermDays] = useState<number>(initTerm);
  const [customDue, setCustomDue] = useState(initTerm === -1 ? existingDueDate : "");
  const dueDate = termDays === -1 ? (customDue || orderDate) : addDays(orderDate, termDays);
  const termsLabel = termDays === -1 ? "" : `${termDays}`;
  return { termDays, setTermDays, customDue, setCustomDue, dueDate, termsLabel };
}

/* ═══════════════ Sales order editor ═══════════════ */

function SalesOrderEditor({
  inv,
  products,
  customers,
  phoneLookup,
  editOrder,
  ledgerState,
  onClose,
  onSave,
}: {
  inv: Inv;
  products: Product[];
  customers: string[];
  phoneLookup: (name: string) => string;
  editOrder: SalesOrder | null;
  ledgerState: LedgerState;
  onClose: () => void;
  onSave: (d: Parameters<typeof addSalesOrder>[1]) => void;
}) {
  const [customerName, setCustomerName] = useState(editOrder?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(editOrder?.customerPhone || "");
  const [orderDate, setOrderDate] = useState(editOrder?.orderDate || todayISODate());
  const term = useTermState(orderDate, editOrder?.expectedRepaymentDate || todayISODate());
  const [note, setNote] = useState(editOrder?.note || "");
  const [lines, setLines] = useState<OrderLine[]>(editOrder?.items.length ? [...editOrder.items] : [emptyLine()]);
  const itemsLocked = editOrder?.stockOutApplied;

  const updateLine = (i: number, patch: Partial<OrderLine>) => {
    setLines((prev) => {
      const next = [...prev];
      next[i] = recalcLine({ ...next[i], ...patch });
      return next;
    });
  };

  const handleCustomerChange = (name: string) => {
    setCustomerName(name);
    if (!customerPhone) {
      const ph = phoneLookup(name);
      if (ph) setCustomerPhone(ph);
    }
  };

  return (
    <BottomSheet
      title={editOrder ? inv.editOrder : inv.newSalesOrder}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700"
          onClick={() => {
            if (!customerName.trim()) { alert(inv.fillCustomer); return; }
            const cleaned = lines.map(recalcLine).filter((l) => l.name.trim() && l.qty > 0);
            if (cleaned.length === 0) { alert(inv.fillLine); return; }
            onSave({ customerName, customerPhone, orderDate, expectedRepaymentDate: term.dueDate, items: cleaned, note });
          }}
        >
          {inv.save}
        </button>
      }
    >
      <label className="text-xs text-gray-500">{inv.customerName}</label>
      <input className={inputCls} list="cust-list" value={customerName} onChange={(e) => handleCustomerChange(e.target.value)} />
      <datalist id="cust-list">
        {customers.map((c) => <option key={c} value={c} />)}
      </datalist>

      <label className="text-xs text-gray-500">{inv.customerPhone}</label>
      <input className={inputCls} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />

      <label className="text-xs text-gray-500">{inv.orderDate}</label>
      <input type="date" className={dateInputCls} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />

      <TermChips
        inv={inv}
        orderDate={orderDate}
        termDays={term.termDays}
        customDue={term.customDue}
        onTermChange={term.setTermDays}
        onCustomDueChange={term.setCustomDue}
      />

      <div className="flex justify-between items-center mt-1 mb-1">
        <span className="text-sm font-semibold text-gray-800">{inv.lineItems}</span>
        {!itemsLocked && (
          <button type="button" className="text-emerald-600 text-sm font-medium" onClick={() => setLines((l) => [...l, emptyLine()])}>
            + {inv.addLine}
          </button>
        )}
      </div>
      {itemsLocked && <p className="text-xs text-amber-600 mb-2">{inv.itemsLockedHint}</p>}
      {lines.map((line, i) => (
        <LineEditor
          key={i}
          inv={inv}
          line={line}
          index={i}
          products={products}
          canRemove={!itemsLocked && lines.length > 1}
          ledgerState={ledgerState}
          onUpdate={itemsLocked ? () => {} : updateLine}
          onRemove={(idx) => setLines((l) => l.filter((_, j) => j !== idx))}
        />
      ))}

      <label className="text-xs text-gray-500">{inv.note}</label>
      <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
    </BottomSheet>
  );
}

/* ═══════════════ Purchase order editor ═══════════════ */

function PurchaseOrderEditor({
  inv,
  products,
  editOrder,
  onClose,
  onSave,
}: {
  inv: Inv;
  products: Product[];
  editOrder: PurchaseOrder | null;
  onClose: () => void;
  onSave: (d: Parameters<typeof addPurchaseOrder>[1]) => void;
}) {
  const [orderDate, setOrderDate] = useState(editOrder?.orderDate || todayISODate());
  const term = useTermState(orderDate, editOrder?.dueDate || todayISODate());
  const [note, setNote] = useState(editOrder?.note || "");
  const [lines, setLines] = useState<OrderLine[]>(editOrder?.items.length ? [...editOrder.items] : [emptyLine()]);
  const itemsLocked = editOrder?.stockInApplied;

  const updateLine = (i: number, patch: Partial<OrderLine>) => {
    setLines((prev) => {
      const next = [...prev];
      next[i] = recalcLine({ ...next[i], ...patch });
      return next;
    });
  };

  const orderTotal = useMemo(() => sumLineTotals(lines.map(recalcLine)), [lines]);

  return (
    <BottomSheet
      title={editOrder ? inv.editOrder : inv.newPurchaseOrder}
      onClose={onClose}
      footer={
        <div>
          <div className="bg-gray-100 rounded-lg px-3 py-2.5 mb-2 flex items-center justify-between">
            <span className="text-sm text-gray-600 font-medium">{inv.orderTotalLabel}</span>
            <span className="text-lg font-bold text-gray-900 tabular-nums">{orderTotal.toFixed(2)}</span>
          </div>
          <button
            type="button"
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700"
            onClick={() => {
              const cleaned = lines.map(recalcLine).filter((l) => l.name.trim() && l.qty > 0);
              if (cleaned.length === 0) { alert(inv.fillLine); return; }
              const termsNote = term.termDays === -1 ? inv.termCustom : `${term.termDays}${inv.termDayUnit}`;
              onSave({ supplierName: "-", orderDate, dueDate: term.dueDate, termsNote, items: cleaned, note });
            }}
          >
            {inv.save}
          </button>
        </div>
      }
    >
      <label className="text-xs text-gray-500">{inv.orderDate}</label>
      <input type="date" className={dateInputCls} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />

      <TermChips
        inv={inv}
        orderDate={orderDate}
        termDays={term.termDays}
        customDue={term.customDue}
        onTermChange={term.setTermDays}
        onCustomDueChange={term.setCustomDue}
      />

      <div className="flex justify-between items-center mt-1 mb-1">
        <span className="text-sm font-semibold text-gray-800">{inv.lineItems}</span>
        {!itemsLocked && (
          <button type="button" className="text-emerald-600 text-sm font-medium" onClick={() => setLines((l) => [...l, emptyLine()])}>
            + {inv.addLine}
          </button>
        )}
      </div>
      {itemsLocked && <p className="text-xs text-amber-600 mb-2">{inv.itemsLockedHint}</p>}
      {lines.map((line, i) => (
        <LineEditor
          key={i}
          inv={inv}
          line={line}
          index={i}
          products={products}
          canRemove={!itemsLocked && lines.length > 1}
          costMode
          onUpdate={itemsLocked ? () => {} : updateLine}
          onRemove={(idx) => setLines((l) => l.filter((_, j) => j !== idx))}
        />
      ))}

      <label className="text-xs text-gray-500">{inv.note}</label>
      <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
    </BottomSheet>
  );
}

/* ═══════════════ Stock tab ═══════════════ */

function StockTab({
  inv,
  state,
  setState,
}: {
  inv: Inv;
  state: LedgerState;
  setState: Dispatch<SetStateAction<LedgerState>>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);
  const [edit, setEdit] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [pickAdjust, setPickAdjust] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return state.products;
    const q = search.trim().toLowerCase();
    return state.products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.spec.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [state.products, search]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 text-sm placeholder:text-gray-400 outline-none"
            placeholder={inv.searchStock || "搜索商品..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 p-3 space-y-2 pb-20">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-14">
            {state.products.length === 0 ? inv.noItems : inv.noResults}
          </p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setDetail(p)}
              className="w-full text-start bg-gray-50 rounded-xl p-3 border border-gray-100 active:bg-emerald-50 overflow-hidden"
            >
              <div className="flex justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                  {p.spec ? <p className="text-xs text-gray-600 truncate">{p.spec}</p> : null}
                  {p.sku ? <p className="text-[11px] text-gray-400 font-mono truncate">{p.sku}</p> : null}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-emerald-600 tabular-nums">{formatQty(p.qtyOnHand)}</p>
                  <p className="text-[10px] text-gray-400">{p.unit}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
      <FabMenu
        upLabel={inv.fabStockIn}
        downLabel={inv.fabStockOut}
        onUp={() => setShowAdd(true)}
        onDown={() => {
          if (state.products.length === 0) { alert(inv.noItems); return; }
          setPickAdjust(true);
        }}
      />
      {showAdd && (
        <ProductForm inv={inv} onClose={() => setShowAdd(false)} onSave={(row) => { setState((s) => addProduct(s, row)); setShowAdd(false); }} />
      )}
      {detail && (
        <ProductDetailSheet
          inv={inv}
          product={detail}
          state={state}
          onClose={() => setDetail(null)}
          onEdit={() => { setEdit(detail); setDetail(null); }}
          onDelete={() => {
            if (window.confirm(inv.confirmDeleteProduct)) {
              setState((s) => deleteProduct(s, detail.id));
              setDetail(null);
            }
          }}
        />
      )}
      {edit && <EditProductSheet inv={inv} product={edit} onClose={() => setEdit(null)} setState={setState} />}
      {pickAdjust && (
        <OrderPickerSheet
          title={inv.stockAdjustTitle}
          items={state.products.map((p) => ({
            id: p.id,
            label: p.name,
            sub: `${inv.qtyOnHand}: ${formatQty(p.qtyOnHand)} ${p.unit}`,
          }))}
          onClose={() => setPickAdjust(false)}
          onPick={(id) => {
            const p = state.products.find((x) => x.id === id);
            if (p) { setAdjustProduct(p); setPickAdjust(false); }
          }}
        />
      )}
      {adjustProduct && (
        <StockAdjustSheet
          inv={inv}
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onSave={(delta) => {
            setState((s) => updateProduct(s, adjustProduct.id, { qtyOnHand: round2(adjustProduct.qtyOnHand + delta) }));
            setAdjustProduct(null);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════ Product detail with FIFO batches ═══════════════ */

function ProductDetailSheet({
  inv,
  product,
  state,
  onClose,
  onEdit,
  onDelete,
}: {
  inv: Inv;
  product: Product;
  state: LedgerState;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const batches = useMemo(() => productFifoBatches(state, product.id), [state, product.id]);
  const currentCost = useMemo(() => fifoCostPrice(state, product.id), [state, product.id]);
  const fmt = (n: number) => n.toFixed(2);

  const totalIn = batches.reduce((a, b) => a + b.inQty, 0);
  const totalRemain = batches.reduce((a, b) => a + b.remainQty, 0);

  return (
    <BottomSheet
      title={product.name}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm flex items-center justify-center gap-1.5 active:bg-gray-50">
            <Pencil className="w-3.5 h-3.5" />{inv.editProduct}
          </button>
          <button type="button" onClick={onDelete} className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-sm flex items-center justify-center gap-1.5 active:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />{inv.deleteProduct}
          </button>
        </div>
      }
    >
      <div className="space-y-1.5 text-sm mb-3">
        {product.spec ? (
          <div className="flex gap-2">
            <span className="text-gray-400 shrink-0">{inv.spec}</span>
            <span className="text-gray-900">{product.spec}</span>
          </div>
        ) : null}
        <div className="flex gap-2">
          <span className="text-gray-400 shrink-0">{inv.qtyOnHand}</span>
          <span className="font-bold text-emerald-600 tabular-nums">{formatQty(product.qtyOnHand)} {product.unit}</span>
        </div>
        {currentCost > 0 && (
          <div className="flex gap-2">
            <span className="text-gray-400 shrink-0">{inv.fifoCost}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{fmt(currentCost)}</span>
          </div>
        )}
      </div>

      {batches.length > 0 ? (
        <>
          <p className="font-semibold text-gray-800 text-sm mb-1.5">{inv.batchTitle}</p>
          <div className="border border-gray-100 rounded-lg overflow-hidden mb-3">
            <div className="grid grid-cols-4 text-[10px] text-gray-400 font-medium px-2.5 py-1.5 bg-gray-50 border-b border-gray-100">
              <span>{inv.batchDate}</span>
              <span className="text-right">{inv.batchIn}</span>
              <span className="text-right">{inv.batchRemain}</span>
              <span className="text-right">{inv.unitCostLabel}</span>
            </div>
            {batches.map((b, i) => (
              <div
                key={i}
                className={`grid grid-cols-4 text-xs px-2.5 py-2 border-b border-gray-50 last:border-b-0 ${
                  b.remainQty > 0 ? "bg-white" : "bg-gray-50 text-gray-400"
                }`}
              >
                <span className="tabular-nums">{b.orderDate}</span>
                <span className="text-right tabular-nums">{formatQty(b.inQty)}</span>
                <span className={`text-right tabular-nums font-semibold ${b.remainQty > 0 ? "text-emerald-600" : ""}`}>
                  {formatQty(b.remainQty)}
                </span>
                <span className="text-right tabular-nums">{fmt(b.unitCost)}</span>
              </div>
            ))}
            <div className="grid grid-cols-4 text-xs font-semibold px-2.5 py-2 bg-gray-50 border-t border-gray-200">
              <span className="text-gray-500">{inv.batchTotal}</span>
              <span className="text-right tabular-nums text-gray-700">{formatQty(totalIn)}</span>
              <span className="text-right tabular-nums text-emerald-600">{formatQty(totalRemain)}</span>
              <span />
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400 mb-3">{inv.noBatches}</p>
      )}
    </BottomSheet>
  );
}

/* ═══════════════ Product forms ═══════════════ */

function EditProductSheet({
  inv,
  product,
  onClose,
  setState,
}: {
  inv: Inv;
  product: Product;
  onClose: () => void;
  setState: Dispatch<SetStateAction<LedgerState>>;
}) {
  const [name, setName] = useState(product.name);
  const [spec, setSpec] = useState(product.spec);
  const [sku, setSku] = useState(product.sku);
  const [unit, setUnit] = useState(product.unit);
  const [qtyStr, setQtyStr] = useState(String(product.qtyOnHand));
  const [note, setNote] = useState(product.note);
  return (
    <BottomSheet
      title={inv.editProduct}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-medium active:bg-emerald-700"
            onClick={() => {
              if (!name.trim()) { alert(inv.fillName); return; }
              setState((s) => updateProduct(s, product.id, {
                name, spec, sku, unit,
                qtyOnHand: Math.max(0, parseFloat(qtyStr) || 0),
                note,
              }));
              onClose();
            }}
          >
            {inv.save}
          </button>
          <button
            type="button"
            className="w-full py-2 rounded-xl border border-red-200 text-red-600 text-sm active:bg-red-50"
            onClick={() => {
              if (window.confirm(inv.confirmDeleteProduct)) {
                setState((s) => deleteProduct(s, product.id));
                onClose();
              }
            }}
          >
            {inv.deleteProduct}
          </button>
        </div>
      }
    >
      <label className="text-xs text-gray-500">{inv.productName}</label>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />

      <label className="text-xs text-gray-500">{inv.spec}</label>
      <input className={inputCls} placeholder={inv.specPh} value={spec} onChange={(e) => setSpec(e.target.value)} />

      <label className="text-xs text-gray-500">{inv.sku}</label>
      <input className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)} />

      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-gray-500">{inv.unit}</label>
          <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-xs text-gray-500">{inv.qtyOnHand}</label>
          <input className={inputCls} inputMode="decimal" value={qtyStr} onChange={(e) => setQtyStr(sanitizeNum(e.target.value))} />
        </div>
      </div>

      <label className="text-xs text-gray-500">{inv.note}</label>
      <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
    </BottomSheet>
  );
}

function ProductForm({ inv, onSave, onClose }: { inv: Inv; onSave: (r: { name: string; spec: string; sku: string; unit: string; qtyOnHand: number; note: string }) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("件");
  const [qty, setQty] = useState("0");
  const [note, setNote] = useState("");
  return (
    <BottomSheet
      title={inv.addProduct}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700"
          onClick={() => {
            if (!name.trim()) { alert(inv.fillName); return; }
            onSave({ name, spec, sku, unit, qtyOnHand: Math.max(0, parseFloat(qty) || 0), note });
          }}
        >
          {inv.save}
        </button>
      }
    >
      <label className="text-xs text-gray-500">{inv.productName}</label>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />

      <label className="text-xs text-gray-500">{inv.spec}</label>
      <input className={inputCls} placeholder={inv.specPh} value={spec} onChange={(e) => setSpec(e.target.value)} />

      <label className="text-xs text-gray-500">{inv.sku}</label>
      <input className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)} />

      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-gray-500">{inv.unit}</label>
          <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-xs text-gray-500">{inv.qtyOnHand}</label>
          <input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(sanitizeNum(e.target.value))} />
        </div>
      </div>

      <label className="text-xs text-gray-500">{inv.note}</label>
      <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
    </BottomSheet>
  );
}

export default DealerLedgerPage;
