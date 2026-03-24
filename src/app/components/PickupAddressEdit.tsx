import { useState, useEffect } from "react";
import { SecondaryView } from "./SecondaryView";
import { useLanguage } from "../hooks/useLanguage";
import { kvPutEncrypted } from "../utils/db";
import { storageSet } from "../utils/safeStorage";

interface PickupAddressEditProps {
  onClose: () => void;
  initialAddress?: string;
  onSave?: (address: string) => void;
}

export function PickupAddressEdit({ 
  onClose, 
  initialAddress = "",
  onSave 
}: PickupAddressEditProps) {
  const { t } = useLanguage();
  const [address, setAddress] = useState(initialAddress);

  // 自动保存 - 当地址改变时
  useEffect(() => {
    const timer = setTimeout(() => {
      if (address !== initialAddress) {
        // 保存到 Dexie (encrypted) + localStorage fallback
        kvPutEncrypted("pickup-address", address).catch(() => {});
        storageSet("pickup-address", address);
        // 如果有回调函数，调用它
        if (onSave) {
          onSave(address);
        }
      }
    }, 500); // 延迟500ms保存，避免频繁保存

    return () => clearTimeout(timer);
  }, [address, initialAddress, onSave]);

  return (
    <SecondaryView 
      onClose={onClose} 
      title={t.profile.pickupInfo}
      showTitle={true}
    >
      <div className="p-4 h-full">
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder=""
          className="w-full h-full text-sm text-gray-800 outline-none resize-none placeholder:text-gray-400 p-4"
          autoFocus
        />
      </div>
    </SecondaryView>
  );
}