import { useState, useMemo, useCallback, useRef } from "react";
import { ChevronLeft, Search, X, BellOff, Bell } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import { getAvatarColor, type Conversation } from "./ConversationListPage";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

function getInitialLetter(pinyin?: string, name?: string): string {
  const src = pinyin || name || "";
  if (!src) return "#";
  const first = src[0].toUpperCase();
  if (first >= "A" && first <= "Z") return first;
  return "#";
}

interface ContactsPageProps {
  contacts: Conversation[];
  mutedIds: Set<string>;
  onBack: () => void;
  onOpenChat: (conversation: Conversation) => void;
  onToggleMute: (id: string) => void;
}

export function ContactsPage({ contacts, mutedIds, onBack, onOpenChat, onToggleMute }: ContactsPageProps) {
  const { t, isRTL } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<Conversation | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const indexBarRef = useRef<HTMLDivElement>(null);

  const allContacts = contacts;

  const filteredContacts = useMemo(() => {
    if (!searchQuery) return allContacts;
    const q = searchQuery.toLowerCase();
    return allContacts.filter(
      (c) =>
        c.peerName.toLowerCase().includes(q) ||
        (c.pinyin || "").toLowerCase().includes(q)
    );
  }, [searchQuery, allContacts]);

  const contactGroups = useMemo(() => {
    const groups: Record<string, Conversation[]> = {};
    for (const c of filteredContacts) {
      const letter = getInitialLetter(c.pinyin, c.peerName);
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (a.pinyin || a.peerName).localeCompare(b.pinyin || b.peerName));
    }
    return groups;
  }, [filteredContacts]);

  const availableLetters = useMemo(() => {
    const set = new Set(Object.keys(contactGroups));
    return ALPHABET.filter((l) => set.has(l));
  }, [contactGroups]);

  const scrollToLetter = useCallback((letter: string) => {
    setActiveIndex(letter);
    const el = sectionRefs.current[letter];
    if (el && scrollContainerRef.current) {
      const containerTop = scrollContainerRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      scrollContainerRef.current.scrollTop += elTop - containerTop;
    }
  }, []);

  const handleIndexTouch = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch || !indexBarRef.current) return;
      const rect = indexBarRef.current.getBoundingClientRect();
      const y = touch.clientY - rect.top;
      const idx = Math.floor((y / rect.height) * availableLetters.length);
      const clamped = Math.max(0, Math.min(availableLetters.length - 1, idx));
      scrollToLetter(availableLetters[clamped]);
    },
    [availableLetters, scrollToLetter]
  );

  const handleIndexTouchEnd = useCallback(() => {
    setTimeout(() => setActiveIndex(null), 600);
  }, []);

  const handleToggleMuteAndClose = useCallback(() => {
    if (contextMenu) {
      onToggleMute(contextMenu.id);
      setContextMenu(null);
    }
  }, [contextMenu, onToggleMute]);

  const isSearching = searchQuery.length > 0;

  return (
    <div className="flex flex-col h-full bg-[#EDEDED]">
      {/* ---- Header ---- */}
      <div className="bg-emerald-600 px-2 py-1.5 flex-shrink-0 shadow-md">
        <div className="flex items-center relative h-10">
          <button
            className="w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-xl active:bg-white/10 z-10"
            onClick={onBack}
          >
            <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2} />
          </button>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <h2 className="text-[16px] font-semibold text-white">
              {t.community?.contacts || "通讯录"}
            </h2>
          </div>
        </div>
      </div>

      {/* ---- Search ---- */}
      <div className="px-3 py-2 flex-shrink-0 bg-[#EDEDED]">
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.common?.search || "搜索"}
            className="w-full bg-white rounded-lg pl-8 pr-7 py-[7px] text-[13px] text-gray-900 placeholder-gray-400 outline-none"
          />
          {searchQuery && (
            <button className="absolute inset-y-0 right-1.5 flex items-center" onClick={() => setSearchQuery("")}>
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* ---- Contact list grouped by letter ---- */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative min-h-0">
        {availableLetters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-sm">{t.common?.noResults || "未找到联系人"}</p>
          </div>
        ) : (
          availableLetters.map((letter) => (
            <div key={letter} ref={(el) => { sectionRefs.current[letter] = el; }}>
              <div className="px-4 py-1 bg-[#EDEDED] sticky top-0 z-10">
                <span className="text-xs font-semibold text-gray-500">{letter}</span>
              </div>
              {contactGroups[letter]?.map((conv) => (
                <ContactRow
                  key={conv.id}
                  conversation={conv}
                  isMuted={mutedIds.has(conv.id)}
                  onClick={() => onOpenChat(conv)}
                  onLongPress={setContextMenu}
                  isRTL={isRTL}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* ---- Right-side A-Z index bar ---- */}
      {!isSearching && (
        <div
          ref={indexBarRef}
          className={`fixed ${isRTL ? "left-0.5" : "right-0.5"} flex flex-col items-center justify-center z-30 select-none`}
          style={{ top: "30%", bottom: "12%" }}
          onTouchMove={handleIndexTouch}
          onTouchStart={handleIndexTouch}
          onTouchEnd={handleIndexTouchEnd}
        >
          {availableLetters.map((letter) => (
            <button
              key={letter}
              className={`w-5 h-[18px] flex items-center justify-center text-[10px] font-medium transition-colors ${
                activeIndex === letter ? "text-emerald-600 scale-125" : "text-gray-500"
              }`}
              onClick={() => scrollToLetter(letter)}
            >
              {letter}
            </button>
          ))}
        </div>
      )}

      {/* Letter indicator overlay */}
      {activeIndex && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="w-16 h-16 bg-black/60 rounded-2xl flex items-center justify-center">
            <span className="text-white text-2xl font-bold">{activeIndex}</span>
          </div>
        </div>
      )}

      {/* ---- Context menu (long-press action sheet) ---- */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed left-4 right-4 z-50 bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[14px] font-medium text-gray-700">{contextMenu.peerName}</span>
            </div>
            <button
              className="flex items-center gap-3 w-full px-4 py-3.5 active:bg-gray-50 text-left"
              onClick={handleToggleMuteAndClose}
            >
              {mutedIds.has(contextMenu.id) ? (
                <>
                  <Bell className="w-5 h-5 text-emerald-600" />
                  <span className="text-[15px] text-gray-800">{t.community?.unmute || "取消屏蔽"}</span>
                </>
              ) : (
                <>
                  <BellOff className="w-5 h-5 text-gray-500" />
                  <span className="text-[15px] text-gray-800">{t.community?.mute || "屏蔽消息"}</span>
                </>
              )}
            </button>
            <button
              className="w-full py-3.5 text-center text-[15px] text-gray-500 active:bg-gray-50 border-t border-gray-200"
              onClick={() => setContextMenu(null)}
            >
              {t.common?.cancel || "取消"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Contact row with long-press ----
function ContactRow({
  conversation: conv,
  isMuted,
  onClick,
  onLongPress,
  isRTL,
}: {
  conversation: Conversation;
  isMuted: boolean;
  onClick: () => void;
  onLongPress: (conv: Conversation) => void;
  isRTL: boolean;
}) {
  const initial = conv.peerName[0]?.toUpperCase() || "?";
  const colorClass = isMuted ? "bg-gray-400" : getAvatarColor(conv.id);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);

  const handleTouchStart = useCallback(() => {
    movedRef.current = false;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onLongPress(conv);
    }, 500);
  }, [conv, onLongPress]);

  const handleTouchMove = useCallback(() => {
    movedRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const handleClick = useCallback(() => {
    if (!movedRef.current) onClick();
  }, [onClick]);

  return (
    <button
      className="flex items-center gap-3 w-full px-4 py-2.5 bg-white active:bg-gray-50 transition-colors border-b border-gray-100/60 text-left select-none"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className={`w-10 h-10 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0 transition-colors`}>
        {conv.peerAvatar ? (
          <img src={conv.peerAvatar} alt="" className={`w-full h-full rounded-lg object-cover ${isMuted ? "grayscale" : ""}`} />
        ) : (
          <span className="text-white font-semibold text-sm">{initial}</span>
        )}
      </div>
      <span className={`text-[15px] truncate ${isMuted ? "text-gray-400" : "text-gray-900"}`}>{conv.peerName}</span>
      {isMuted && <BellOff className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 ml-auto" />}
    </button>
  );
}
