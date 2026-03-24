import { useState, useEffect, useCallback } from "react";
import { useConfigContext } from "../../../hooks/ConfigProvider";
import { useLanguage } from "../../../hooks/useLanguage";
import { contactStorage, type DealerContact } from "../../../services/ContactStorageService";

export function useMerchantBind() {
  const { config } = useConfigContext();
  const { t } = useLanguage();

  const [showScanner, setShowScanner] = useState(false);
  const [showScanActionSheet, setShowScanActionSheet] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: "verifying" | "verified" | "rejected";
    merchantData?: any;
    sourceDomain?: string;
    rejectReason?: string;
  } | null>(null);

  const [scanAlbumScanning, setScanAlbumScanning] = useState(false);
  const [scanAlbumError, setScanAlbumError] = useState("");
  const [scanSheetAnim, setScanSheetAnim] = useState<'entering' | 'visible' | 'leaving'>('entering');

  useEffect(() => {
    if (showScanActionSheet) {
      setScanSheetAnim('entering');
      requestAnimationFrame(() => setScanSheetAnim('visible'));
    }
  }, [showScanActionSheet]);

  const closeScanActionSheet = useCallback(() => {
    setScanSheetAnim('leaving');
    setTimeout(() => {
      setShowScanActionSheet(false);
      setScanAlbumError("");
    }, 200);
  }, []);

  const processScanResult = useCallback((qrText: string) => {
    setScanResult({ status: "verifying" });

    setTimeout(() => {
      try {
        const url = new URL(qrText);
        const sourceDomain = url.hostname.replace(/^www\./, "");

        const whitelist = (config?.chatContact?.verifiedDomains || [])
          .map((d: string) => d.toLowerCase().replace(/^www\./, "").trim())
          .filter(Boolean);

        if (whitelist.length === 0) {
          setScanResult({
            status: "rejected",
            sourceDomain,
            rejectReason: "未配置域名白名单，无法验证商家身份 / No verified domains configured",
          });
          return;
        }

        const isDomainVerified = whitelist.some((allowed: string) =>
          sourceDomain === allowed || sourceDomain.endsWith("." + allowed)
        );

        if (!isDomainVerified) {
          setScanResult({
            status: "rejected",
            sourceDomain,
            rejectReason: `域名 "${sourceDomain}" 不在白名单中 / Domain not in whitelist`,
          });
          return;
        }

        const params = url.searchParams;
        const merchantData = {
          name: params.get("name") || "",
          avatar: params.get("avatar") || "",
          subtitle: params.get("subtitle") || "",
          imUserId: params.get("imUserId") || "",
          channelId: params.get("channelId") || "",
          imProvider: params.get("imProvider") || "tencent-im",
          phone: params.get("phone") || "",
          storeId: params.get("storeId") || "",
        };

        if (!merchantData.name || !merchantData.imUserId || !merchantData.channelId) {
          setScanResult({
            status: "rejected",
            sourceDomain,
            rejectReason: "二维码缺少必要信息（商家名称、IM用户ID或聊天室ID） / Missing required fields (name, imUserId, or channelId)",
          });
          return;
        }

        setScanResult({
          status: "verified",
          merchantData,
          sourceDomain,
        });
      } catch {
        setScanResult({
          status: "rejected",
          rejectReason: "无法解析二维码内容，格式无效 / Invalid QR code format",
        });
      }
    }, 800);
  }, [config?.chatContact?.verifiedDomains]);

  const confirmBindMerchant = useCallback(async () => {
    if (!scanResult?.merchantData) return;

    const md = scanResult.merchantData;
    const name = md.name || '';
    const pinyinRaw = name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '').toLowerCase();

    const newContact: DealerContact = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      farmerName: name,
      farmerAvatar: md.avatar || '',
      imUserId: md.imUserId || '',
      imProvider: md.imProvider || 'tencent-im',
      channelId: md.channelId || '',
      phone: md.phone || '',
      storeId: md.storeId || '',
      pinyin: pinyinRaw,
      isMuted: false,
      boundAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await contactStorage.upsert(newContact);
    console.log("[Scan] Contact added to contacts list:", newContact.farmerName);
    setScanResult(null);
  }, [scanResult]);

  const handleScanAlbumFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!window.BarcodeDetector) {
      setScanAlbumError(t.community?.qrNotSupported || "QR detection not supported in this browser");
      return;
    }

    setScanAlbumScanning(true);
    setScanAlbumError("");

    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const bitmap = await createImageBitmap(file);
      const barcodes = await detector.detect(bitmap);

      if (barcodes.length > 0 && barcodes[0].rawValue) {
        if (navigator.vibrate) navigator.vibrate(100);
        closeScanActionSheet();
        processScanResult(barcodes[0].rawValue);
      } else {
        setScanAlbumError(t.community?.noQrDetected || "No QR code detected. Please try again.");
      }
    } catch (err) {
      console.error("[Scan] Album scan error:", err);
      setScanAlbumError(t.community?.scanFailed || "Detection failed. Please try again.");
    } finally {
      setScanAlbumScanning(false);
    }
  }, [t.community, closeScanActionSheet, processScanResult]);

  return {
    showScanner,
    setShowScanner,
    showScanActionSheet,
    setShowScanActionSheet,
    scanResult,
    setScanResult,
    scanAlbumScanning,
    scanAlbumError,
    scanSheetAnim,
    closeScanActionSheet,
    processScanResult,
    confirmBindMerchant,
    handleScanAlbumFile,
  };
}