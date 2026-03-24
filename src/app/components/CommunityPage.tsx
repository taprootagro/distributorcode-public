import { useState, useEffect, useCallback, lazy, Suspense, useRef } from "react";
import { ConversationListPage, type Conversation } from "./community/ConversationListPage";
import { ContactsPage } from "./community/ContactsPage";
import { useMerchantBind } from "./community/hooks/useMerchantBind";
import { contactStorage, type DealerContact } from "../services/ContactStorageService";

const LazyChatDetailPage = lazy(() =>
  import("./community/ChatDetailPage").then((m) => ({ default: m.ChatDetailPage }))
);
const LazyMerchantBindActionSheet = lazy(() =>
  import("./community/MerchantBindActionSheet").then((m) => ({
    default: m.MerchantBindActionSheet,
  }))
);

function contactToConversation(c: DealerContact): Conversation {
  return {
    id: c.id,
    peerId: c.imUserId,
    peerName: c.farmerName,
    peerAvatar: c.farmerAvatar,
    lastMessage: c.lastMessage,
    lastMessageTime: c.lastMessageTime,
    unreadCount: c.unreadCount || 0,
    pinyin: c.pinyin,
    imUserId: c.imUserId,
    imProvider: c.imProvider,
    channelId: c.channelId,
  };
}

type ActiveView = "list" | "contacts" | "chat";

export function CommunityPage() {
  const [activeView, setActiveView] = useState<ActiveView>("list");
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [chatDetailEverShown, setChatDetailEverShown] = useState(false);
  const [contactsEverShown, setContactsEverShown] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => new Set());

  // Load contacts from IndexedDB on mount, subscribe to changes
  useEffect(() => {
    contactStorage.getAll().then(contacts => {
      const convs = contacts.map(contactToConversation);
      setConversations(convs);
      setMutedIds(new Set(contacts.filter(c => c.isMuted).map(c => c.id)));
    });

    const unsub = contactStorage.onChange(contacts => {
      setConversations(contacts.map(contactToConversation));
      setMutedIds(new Set(contacts.filter(c => c.isMuted).map(c => c.id)));
    });

    // Background sync from cloud
    contactStorage.syncFromCloud().catch(() => {});

    return unsub;
  }, []);

  const {
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
  } = useMerchantBind();

  const scanAlbumInputRef = useRef<HTMLInputElement>(null);
  const [merchantBindEverShown, setMerchantBindEverShown] = useState(false);

  // Open chat and clear unread
  const handleOpenChat = useCallback((conversation: Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversation.id ? { ...c, unreadCount: 0 } : c))
    );
    setActiveConversation({ ...conversation, unreadCount: 0 });
    setActiveView("chat");
    setChatDetailEverShown(true);
  }, []);

  const handleOpenContacts = useCallback(() => {
    setActiveView("contacts");
    setContactsEverShown(true);
  }, []);

  const handleBackToList = useCallback(() => {
    setActiveView("list");
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    contactStorage.remove(id).catch(() => {});
  }, []);

  const handleToggleMute = useCallback((id: string) => {
    setMutedIds((prev) => {
      const next = new Set(prev);
      const newMuted = !next.has(id);
      if (newMuted) next.add(id); else next.delete(id);
      contactStorage.patch(id, { isMuted: newMuted }).catch(() => {});
      return next;
    });
  }, []);

  const handleOpenScan = useCallback(() => {
    setShowScanActionSheet(true);
    setMerchantBindEverShown(true);
  }, [setShowScanActionSheet]);

  const handleQRScanResult = useCallback(
    (qrText: string) => {
      setShowScanner(false);
      processScanResult(qrText);
    },
    [setShowScanner, processScanResult]
  );

  const needsMerchantBind =
    merchantBindEverShown || showScanner || showScanActionSheet || scanResult !== null;

  return (
    <div className="flex flex-col h-full relative">
      {/* Merchant bind overlays */}
      {needsMerchantBind && (
        <Suspense fallback={null}>
          <LazyMerchantBindActionSheet
            showScanner={showScanner}
            setShowScanner={setShowScanner}
            showScanActionSheet={showScanActionSheet}
            scanSheetAnim={scanSheetAnim}
            closeScanActionSheet={closeScanActionSheet}
            scanAlbumInputRef={scanAlbumInputRef}
            handleScanAlbumFile={handleScanAlbumFile}
            scanAlbumScanning={scanAlbumScanning}
            scanAlbumError={scanAlbumError}
            scanResult={scanResult}
            setScanResult={setScanResult}
            confirmBindMerchant={confirmBindMerchant}
            handleQRScanResult={handleQRScanResult}
          />
        </Suspense>
      )}

      {/* Three-layer view with slide transitions */}
      <div className="flex-1 relative overflow-hidden">
        {/* Layer 1: Conversation list */}
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{
            transform: activeView === "list" ? "translateX(0)" : "translateX(-30%)",
            opacity: activeView === "list" ? 1 : 0,
            pointerEvents: activeView === "list" ? "auto" : "none",
          }}
        >
          <ConversationListPage
            conversations={conversations}
            mutedIds={mutedIds}
            onOpenChat={handleOpenChat}
            onOpenScan={handleOpenScan}
            onOpenContacts={handleOpenContacts}
            onDeleteConversation={handleDeleteConversation}
            onToggleMute={handleToggleMute}
          />
        </div>

        {/* Layer 2: Contacts */}
        {contactsEverShown && (
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out bg-[#EDEDED]"
            style={{
              transform: activeView === "contacts" ? "translateX(0)" : "translateX(100%)",
            }}
          >
            <ContactsPage
              contacts={conversations}
              mutedIds={mutedIds}
              onBack={handleBackToList}
              onOpenChat={handleOpenChat}
              onToggleMute={handleToggleMute}
            />
          </div>
        )}

        {/* Layer 3: Chat detail */}
        {chatDetailEverShown && (
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out bg-[#EDEDED]"
            style={{
              transform: activeView === "chat" ? "translateX(0)" : "translateX(100%)",
            }}
          >
            {activeConversation && (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <LazyChatDetailPage
                  conversation={activeConversation}
                  onBack={handleBackToList}
                />
              </Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CommunityPage;
