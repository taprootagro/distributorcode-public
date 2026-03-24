import { useState, useEffect, startTransition } from "react";
import { MapPin, Edit, Settings, FileText, Package, CreditCard, Calendar, Info, QrCode, ChevronRight, LogIn } from "lucide-react";
import { useNavigate } from "react-router";
import { useLanguage } from "../hooks/useLanguage";
import { useAppIcon } from "../hooks/useAppIcon";
import { useConfigContext } from "../hooks/ConfigProvider";
import { storageGet } from "../utils/safeStorage";
import { isUserLoggedIn, getUserId } from "../utils/auth";
import { kvGetEncrypted } from "../utils/db";
import { PickupAddressEdit } from "./PickupAddressEdit";
import { AllOrdersPage } from "./AllOrdersPage";
import { PendingReceiptPage } from "./PendingReceiptPage";
import { PendingPaymentPage } from "./PendingPaymentPage";
import { InvoiceRecordsPage } from "./InvoiceRecordsPage";
import { AbnormalFeedbackPage } from "./AbnormalFeedbackPage";
import { AboutUsPage } from "./AboutUsPage";
import { ProfileDetailPage } from "./ProfileDetailPage";

import ProfileQRCard from "./ProfileQRCard";

export function ProfilePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const appIcon = useAppIcon();
  const { config } = useConfigContext();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAddressEdit, setShowAddressEdit] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [showPendingReceipt, setShowPendingReceipt] = useState(false);
  const [showPendingPayment, setShowPendingPayment] = useState(false);
  const [showInvoiceRecords, setShowInvoiceRecords] = useState(false);
  const [showAbnormalFeedback, setShowAbnormalFeedback] = useState(false);
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);
  const [showQRCard, setShowQRCard] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");

  const userId = getUserId();

  useEffect(() => {
    setIsLoggedIn(isUserLoggedIn());
    const savedAddress = storageGet("pickup-address");
    if (savedAddress) setPickupAddress(savedAddress);
    kvGetEncrypted("pickup-address").then((addr) => {
      if (addr) setPickupAddress(addr);
    }).catch(() => {});
  }, []);

  const menuItems = [
    {
      section: "",
      items: [
        { icon: FileText, label: t.profile.allOrders, color: "text-blue-600", action: () => setShowAllOrders(true) },
        { icon: Package, label: t.profile.pendingReceipt, color: "text-green-600", action: () => setShowPendingReceipt(true) },
        { icon: CreditCard, label: t.profile.pendingPayment, color: "text-orange-600", action: () => setShowPendingPayment(true) },
        { icon: Calendar, label: t.profile.invoiceRecords, color: "text-purple-600", action: () => setShowInvoiceRecords(true) },
        { icon: Info, label: t.profile.abnormalFeedback, color: "text-red-600", action: () => setShowAbnormalFeedback(true) },
      ],
    },
    {
      section: "",
      items: [
        { icon: Settings, label: t.profile.settings, color: "text-gray-600", action: () => startTransition(() => navigate("/settings")) },
        { icon: Info, label: t.profile.aboutUs, color: "text-emerald-600", action: () => setShowAboutUs(true) },
      ],
    },
  ];

  // 未登录
  if (!isLoggedIn) {
    return (
      <div className="pb-safe-nav min-h-full relative" style={{ backgroundColor: 'var(--app-bg)' }}>
        <div className="absolute top-0 left-0 right-0 h-60 bg-emerald-600 rounded-b-3xl shadow-lg">
          <div className="absolute top-8 ltr:right-8 rtl:left-8 w-20 h-20 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-8 ltr:left-8 rtl:right-8 w-24 h-24 bg-white/10 rounded-full blur-3xl"></div>
        </div>
        <div className="relative z-10 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 8px) + 16px)' }}>
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg ring-4 ring-white/30 mb-3 overflow-hidden">
              {appIcon ? (
                <img src={appIcon} alt="Logo" className="w-12 h-12 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; e.target.parentElement!.querySelector('span')!.style.display = ''; }} />
              ) : null}
              <span className="text-4xl" style={{ display: appIcon ? 'none' : undefined }}>🌿</span>
            </div>
            <p className="text-white/90 text-sm">{t.profile.loginPrompt}</p>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-2xl text-center">
            <button
              onClick={() => startTransition(() => navigate("/login"))}
              className="w-full bg-emerald-600 text-white py-3.5 rounded-2xl active:bg-emerald-700 transition-colors duration-150 flex items-center justify-center gap-2 font-medium shadow-lg"
            >
              <LogIn className="w-5 h-5" />
              {t.common.login}
            </button>
          </div>
          <div className="mt-4">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => startTransition(() => navigate("/settings"))}
                className="w-full px-4 py-3 flex items-center justify-between active:bg-emerald-50 transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-gray-600" />
                  <span className="text-sm text-gray-800">{t.profile.settings}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-emerald-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 已登录
  return (
    <div className="pb-safe-nav min-h-full" style={{ backgroundColor: 'var(--app-bg)' }}>
      {showProfileDetail && <ProfileDetailPage onClose={() => setShowProfileDetail(false)} />}
      {showAddressEdit && (
        <PickupAddressEdit
          initialAddress={pickupAddress}
          onClose={() => setShowAddressEdit(false)}
          onSave={(newAddress) => setPickupAddress(newAddress)}
        />
      )}
      {showAllOrders && <AllOrdersPage onClose={() => setShowAllOrders(false)} />}
      {showPendingReceipt && <PendingReceiptPage onClose={() => setShowPendingReceipt(false)} />}
      {showPendingPayment && <PendingPaymentPage onClose={() => setShowPendingPayment(false)} />}
      {showInvoiceRecords && <InvoiceRecordsPage onClose={() => setShowInvoiceRecords(false)} />}
      {showAbnormalFeedback && <AbnormalFeedbackPage onClose={() => setShowAbnormalFeedback(false)} />}
      {showAboutUs && <AboutUsPage onClose={() => setShowAboutUs(false)} />}

      {/* 懒加载二维码卡片 */}
      {showQRCard && (
        <ProfileQRCard
          onClose={() => setShowQRCard(false)}
          userId={userId || ""}
          name={config?.userProfile?.name || "Rick"}
        />
      )}

      {/* 绿色头部 — 头像 + 网名 + 二维码 水平对齐 */}
      <div className="bg-emerald-600 px-4 pb-5 rounded-b-3xl shadow-lg" style={{ paddingTop: 'calc(env(safe-area-inset-top, 8px) + 16px)' }}>
        <div className="flex items-center gap-3">
          {/* 头像 — 点击进入编辑 */}
          <button
            onClick={() => setShowProfileDetail(true)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg flex-shrink-0 overflow-hidden ring-4 ring-white/20 active:opacity-80 transition-opacity"
          >
            {config?.userProfile?.avatar ? (
              <img
                src={config.userProfile.avatar}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white">
                <span className="text-2xl">🌿</span>
              </div>
            )}
          </button>

          {/* 网名 — 点击进入编辑 */}
          <button
            onClick={() => setShowProfileDetail(true)}
            className="flex-1 min-w-0 text-start active:opacity-80 transition-opacity"
          >
            <h2 className="text-xl font-semibold text-white truncate">
              {config?.userProfile?.name || "Rick"}
            </h2>
          </button>

          {/* 二维码按钮 */}
          <button
            onClick={() => setShowQRCard(true)}
            className="flex-shrink-0 text-white active:scale-95 transition-transform duration-150 bg-white/10 p-2.5 rounded-full backdrop-blur-sm"
          >
            <QrCode className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 提货地点卡片 */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-2xl p-3 shadow-lg">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-800 mb-1.5">{t.profile.pickupInfo}</h3>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 break-all">{pickupAddress}</p>
            </div>
            <button
              onClick={() => setShowAddressEdit(true)}
              className="text-emerald-600 active:scale-95 transition-transform duration-150 flex-shrink-0"
            >
              <Edit className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 菜单列表 */}
      <div className="px-4 mt-4 space-y-3">
        {menuItems.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-white rounded-2xl overflow-hidden shadow-lg">
            {section.section && (
              <div className="px-4 py-2 bg-gray-50">
                <h3 className="text-sm text-gray-600">{section.section}</h3>
              </div>
            )}
            {section.items.map((item, itemIndex) => {
              const Icon = item.icon;
              return (
                <div key={itemIndex}>
                  <button
                    onClick={item.action}
                    className="w-full px-4 py-3 flex items-center justify-between active:bg-emerald-100 transition-colors duration-150 min-w-0"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Icon className={`w-5 h-5 flex-shrink-0 ${item.color}`} />
                      <span className="text-sm text-gray-800 truncate">{item.label}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  </button>
                  {itemIndex < section.items.length - 1 && (
                    <div className="mx-4" style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.06), transparent)' }}></div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ProfilePage;