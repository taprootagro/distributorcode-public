import { QRCodeCanvas } from "qrcode.react";
import { X } from "lucide-react";

interface ProfileQRCardProps {
  onClose: () => void;
  userId: string;
  name: string;
}

function ProfileQRCardInner({ onClose, userId }: ProfileQRCardProps) {
  const qrValue = userId || "unknown";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />

      <div
        className="relative w-[280px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideUpIn 300ms ease-out" }}
      >
        {/* 二维码 */}
        <div className="pt-8 pb-6 px-6">
          <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-inner flex items-center justify-center">
            <QRCodeCanvas
              value={qrValue}
              size={220}
              level="M"
              marginSize={2}
              fgColor="#064e3b"
              bgColor="#ffffff"
            />
          </div>
        </div>

        {/* 关闭按钮 — 底部红色叉号 */}
        <button
          onClick={onClose}
          className="w-12 h-12 mb-6 rounded-full bg-red-500 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}

export default ProfileQRCardInner;
