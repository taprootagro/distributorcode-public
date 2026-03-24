import { useState, useMemo, useCallback, useRef } from "react";
import { ScanLine, Search, X, MessageSquare, LogIn, ChevronRight, BookUser, Trash2, BellOff } from "lucide-react";
import { useNavigate } from "react-router";
import { useLanguage } from "../../hooks/useLanguage";
import { isUserLoggedIn } from "../../utils/auth";
import { useAppBadge } from "../../hooks/useAppBadge";

// ---- Conversation type (backed by DealerContact) ----
export interface Conversation {
  id: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  pinned?: boolean;
  pinyin?: string;
  // IM fields for real chat
  imUserId?: string;
  imProvider?: string;
  channelId?: string;
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const now = new Date();
  const d = new Date(ts);
  const diff = now.getTime() - ts;
  const oneDay = 86400000;

  if (diff < oneDay && now.getDate() === d.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < oneDay * 2) return "昨天";
  if (diff < oneDay * 7) {
    const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return days[d.getDay()];
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function getAvatarColor(id: string): string {
  const colors = [
    "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-orange-500",
    "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-amber-500",
    "bg-cyan-500", "bg-rose-500", "bg-lime-600", "bg-violet-500",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

interface ConversationListPageProps {
  conversations: Conversation[];
  mutedIds: Set<string>;
  onOpenChat: (conversation: Conversation) => void;
  onOpenScan: () => void;
  onOpenContacts: () => void;
  onDeleteConversation: (id: string) => void;
  onToggleMute: (id: string) => void;
}

export function ConversationListPage({
  conversations,
  mutedIds,
  onOpenChat,
  onOpenScan,
  onOpenContacts,
  onDeleteConversation,
  onToggleMute,
}: ConversationListPageProps) {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{ conv: Conversation; y: number } | null>(null);

  const loggedIn = isUserLoggedIn();
  useAppBadge(0);

  const sortedConversations = useMemo(() => {
    const filtered = searchQuery
      ? conversations.filter(
          (c) =>
            c.peerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.lastMessage || "").toLowerCase().includes(searchQuery.toLowerCase())
        )
      : conversations;

    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });
  }, [searchQuery, conversations]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  const handleLongPress = useCallback((conv: Conversation, y: number) => {
    setContextMenu({ conv, y });
  }, []);

  const handleDelete = useCallback(() => {
    if (contextMenu) {
      onDeleteConversation(contextMenu.conv.id);
      setContextMenu(null);
    }
  }, [contextMenu, onDeleteConversation]);

  const handleMute = useCallback(() => {
    if (contextMenu) {
      onToggleMute(contextMenu.conv.id);
      setContextMenu(null);
    }
  }, [contextMenu, onToggleMute]);

  if (!loggedIn) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-emerald-50 to-white items-center justify-center px-8">
        <div className="w-full max-w-xs text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
            <MessageSquare className="w-10 h-10 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-gray-800 mb-2" style={{ fontSize: "clamp(16px, 4.5vw, 20px)" }}>
              {t.community.loginRequired || "Login Required"}
            </h2>
            <p className="text-gray-500" style={{ fontSize: "clamp(12px, 3.2vw, 14px)" }}>
              {t.community.loginToChat || "Please log in to start chatting"}
            </p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl py-3 font-medium shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            style={{ fontSize: "clamp(13px, 3.5vw, 15px)" }}
          >
            <LogIn className="w-4 h-4" />
            {t.community.goToLogin || "Go to Login"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#EDEDED]">
      {/* ---- Header ---- */}
      <div className="bg-emerald-600 px-3 py-1.5 flex-shrink-0 shadow-md">
        <div className="flex gap-2 items-center">
          <h1 className="text-[15px] font-bold text-white flex-shrink-0 whitespace-nowrap">
            {t.community?.title || "聊天"}
            {totalUnread > 0 && (
              <span className="ml-1 text-[11px] font-medium text-white/60">({totalUnread})</span>
            )}
          </h1>
          <div className="flex-1 min-w-0 bg-white rounded-full px-3 py-1.5 flex items-center gap-2 h-10">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.common?.search || "搜索"}
              className="flex-1 min-w-0 outline-none placeholder:text-gray-400"
              style={{ fontSize: "clamp(13px, 3.5vw, 15px)" }}
            />
            {searchQuery && (
              <button className="flex-shrink-0 w-7 h-7 flex items-center justify-center" onClick={() => setSearchQuery("")}>
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>
          <button
            className="bg-white w-10 h-10 rounded-full active:scale-95 transition-all duration-200 flex items-center justify-center flex-shrink-0 shadow-sm"
            onClick={onOpenScan}
          >
            <ScanLine className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* ---- Scrollable body ---- */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <button
          className="flex items-center gap-3 w-full px-4 py-3 bg-white active:bg-gray-50 transition-colors border-b border-gray-100/80 text-left"
          onClick={onOpenContacts}
        >
          <div className="w-11 h-11 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm">
            <BookUser className="w-5.5 h-5.5 text-white" strokeWidth={1.8} />
          </div>
          <span className="flex-1 text-[15px] font-medium text-gray-900">
            {t.community?.contacts || "通讯录"}
          </span>
          <ChevronRight className="w-4.5 h-4.5 text-gray-400 flex-shrink-0" />
        </button>

        {sortedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <MessageSquare className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">{t.community?.noConversations || "暂无会话"}</p>
          </div>
        ) : (
          <div>
            {sortedConversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                isMuted={mutedIds.has(conv.id)}
                onClick={() => onOpenChat(conv)}
                onLongPress={handleLongPress}
                isRTL={isRTL}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- Context menu (long-press action sheet) ---- */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed left-4 right-4 z-50 bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[14px] font-medium text-gray-700">{contextMenu.conv.peerName}</span>
            </div>
            <button
              className="flex items-center gap-3 w-full px-4 py-3.5 active:bg-gray-50 text-left"
              onClick={handleMute}
            >
              <BellOff className="w-5 h-5 text-gray-500" />
              <span className="text-[15px] text-gray-800">
                {mutedIds.has(contextMenu.conv.id)
                  ? (t.community?.unmute || "取消屏蔽")
                  : (t.community?.mute || "屏蔽消息")}
              </span>
            </button>
            <button
              className="flex items-center gap-3 w-full px-4 py-3.5 active:bg-red-50 text-left border-t border-gray-100"
              onClick={handleDelete}
            >
              <Trash2 className="w-5 h-5 text-red-500" />
              <span className="text-[15px] text-red-600">{t.community?.deleteChat || "删除聊天"}</span>
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

// ---- Conversation row with long-press support ----
function ConversationRow({
  conversation: conv,
  isMuted,
  onClick,
  onLongPress,
  isRTL,
}: {
  conversation: Conversation;
  isMuted: boolean;
  onClick: () => void;
  onLongPress: (conv: Conversation, y: number) => void;
  isRTL: boolean;
}) {
  const initial = conv.peerName[0]?.toUpperCase() || "?";
  const colorClass = isMuted ? "bg-gray-400" : getAvatarColor(conv.id);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    movedRef.current = false;
    const y = e.touches[0]?.clientY || 0;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onLongPress(conv, y);
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
      className="flex items-center gap-3 w-full px-4 py-3 bg-white active:bg-gray-50 transition-colors border-b border-gray-100/80 text-left select-none"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className={`w-12 h-12 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0 shadow-sm transition-colors`}>
        {conv.peerAvatar ? (
          <img src={conv.peerAvatar} alt="" className={`w-full h-full rounded-lg object-cover ${isMuted ? "grayscale" : ""}`} />
        ) : (
          <span className="text-white font-bold text-lg">{initial}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-[15px] font-medium truncate ${isMuted ? "text-gray-400" : "text-gray-900"}`}>
            {conv.peerName}
          </span>
          <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{formatTime(conv.lastMessageTime)}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isMuted && <BellOff className="w-3 h-3 text-gray-400 flex-shrink-0" />}
            <span className="text-[13px] text-gray-500 truncate">{conv.lastMessage || ""}</span>
          </div>
          {conv.unreadCount > 0 && !isMuted && (
            <span className="flex-shrink-0 ml-2 min-w-[18px] h-[18px] px-1.5 bg-red-500 text-white text-[11px] font-medium rounded-full flex items-center justify-center">
              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
            </span>
          )}
          {conv.unreadCount > 0 && isMuted && (
            <span className="flex-shrink-0 ml-2 w-2 h-2 bg-gray-400 rounded-full" />
          )}
        </div>
      </div>
    </button>
  );
}
