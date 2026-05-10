import './index.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser, SignInButton, UserButton } from '@clerk/react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { format, isToday, isYesterday, isSameDay, formatDistanceToNow } from 'date-fns';

const API = 'https://whisper-ksqnn.sevalla.app/api';
const SOCKET_URL = 'https://whisper-ksqnn.sevalla.app';
const EMOJI_OPTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

// ── Helpers ───────────────────────────────────────────────────────
function dateSep(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function apiCall(token, method, url, data) {
  return axios({ method, url: API + url, data, headers: { Authorization: `Bearer ${token}` } });
}

// ── Auth screen ───────────────────────────────────────────────────
function AuthScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">💬</div>
        <h1>Whisper</h1>
        <p>Real-time messaging, beautifully simple.</p>
        <SignInButton mode="modal">
          <button className="sign-in-btn">Sign in to continue →</button>
        </SignInButton>
      </div>
    </div>
  );
}

// ── Main App (signed in) ──────────────────────────────────────────
function ChatApp() {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [text, setText] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState(new Map()); // chatId->userId
  const [unreadChats, setUnreadChats] = useState(new Set());
  const [replyTo, setReplyTo] = useState(null);
  const [ctxMsg, setCtxMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [myDbUser, setMyDbUser] = useState(null);
  const [lastSeenMap, setLastSeenMap] = useState(new Map());
  
  // New chat modal
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const tokenRef = useRef(null);

  const activeChat = chats.find(c => c._id === activeChatId);

  // ── Bootstrap ──────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = await getToken();
      tokenRef.current = token;
      // Sync user with DB
      await apiCall(token, 'POST', '/auth/callback');
      const me = await apiCall(token, 'GET', '/auth/me');
      if (mounted) setMyDbUser(me.data);
      // Load chats
      const res = await apiCall(token, 'GET', '/chats');
      if (mounted) { setChats(res.data); setLoadingChats(false); }
      // Connect socket
      const sock = io(SOCKET_URL, { auth: { token } });
      socketRef.current = sock;
      sock.on('online-users', ({ userIds }) => setOnlineUsers(new Set(userIds)));
      sock.on('user-online', ({ userId }) => setOnlineUsers(s => new Set([...s, userId])));
      sock.on('user-offline', ({ userId, lastSeen }) => {
        setOnlineUsers(s => { const n = new Set(s); n.delete(userId); return n; });
        if (lastSeen) setLastSeenMap(m => new Map(m).set(userId, lastSeen));
      });
      sock.on('new-message', ({ message }) => {
        const senderId = message.sender?._id ?? message.sender;
        setMessages(prev => {
          const filtered = prev.filter(m => !m._id.startsWith('temp-'));
          if (filtered.some(m => m._id === message._id)) return filtered;
          return [...filtered, message];
        });
        setChats(prev => prev.map(c => c._id === message.chat
          ? { ...c, lastMessage: { _id: message._id, text: message.text, sender: senderId, createdAt: message.createdAt }, lastMessageAt: message.createdAt }
          : c));
        // Mark unread if not active chat
        setActiveChatId(cur => {
          if (cur !== message.chat && senderId !== me.data?._id) {
            setUnreadChats(u => new Set([...u, message.chat]));
          }
          return cur;
        });
        setTypingUsers(m => { const n = new Map(m); n.delete(message.chat); return n; });
      });
      sock.on('message-deleted', ({ messageId }) => {
        setMessages(prev => prev.map(m => m._id === messageId ? { ...m, isDeleted: true, text: 'This message was deleted' } : m));
      });
      sock.on('message-reaction', ({ messageId, reactions }) => {
        setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
      });
      sock.on('typing', ({ userId, chatId, isTyping }) => {
        setTypingUsers(m => { const n = new Map(m); isTyping ? n.set(chatId, userId) : n.delete(chatId); return n; });
      });
      sock.on('messages-read', ({ chatId }) => {
        setMessages(prev => prev.map(m => m.chat === chatId ? { ...m, readBy: [...(m.readBy || []), 'read'] } : m));
      });
    })();
    return () => { mounted = false; socketRef.current?.disconnect(); };
  }, []);

  // ── Load messages + mark read ──────────────────────────────────
  useEffect(() => {
    if (!activeChatId) return;
    setLoadingMsgs(true);
    setMessages([]);
    setUnreadChats(u => { const n = new Set(u); n.delete(activeChatId); return n; });
    const sock = socketRef.current;
    sock?.emit('join-chat', activeChatId);
    sock?.emit('message-read', { chatId: activeChatId });
    apiCall(tokenRef.current, 'GET', `/messages/chat/${activeChatId}?limit=50`)
      .then(r => { setMessages(r.data); setLoadingMsgs(false); })
      .catch(() => setLoadingMsgs(false));
    return () => sock?.emit('leave-chat', activeChatId);
  }, [activeChatId]);

  // ── Auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Mark read when new msgs arrive in active chat ──────────────
  useEffect(() => {
    if (activeChatId && messages.length > 0) {
      socketRef.current?.emit('message-read', { chatId: activeChatId });
    }
  }, [messages.length, activeChatId]);

  // ── Send ───────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!text.trim() || !activeChatId || !myDbUser) return;
    const sock = socketRef.current;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      _id: tempId, chat: activeChatId,
      sender: { _id: myDbUser._id, name: myDbUser.name, email: myDbUser.email, avatar: myDbUser.avatar },
      text: text.trim(), replyTo, readBy: [myDbUser._id],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    sock?.emit('send-message', { chatId: activeChatId, text: text.trim(), replyTo: replyTo || undefined });
    setText('');
    setReplyTo(null);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sock?.emit('typing', { chatId: activeChatId, isTyping: false });
  }, [text, activeChatId, myDbUser, replyTo]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTypingChange = (e) => {
    setText(e.target.value);
    const sock = socketRef.current;
    if (!activeChatId) return;
    sock?.emit('typing', { chatId: activeChatId, isTyping: true });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sock?.emit('typing', { chatId: activeChatId, isTyping: false }), 2000);
  };

  const handleReact = (messageId, emoji) => {
    const msg = messages.find(m => m._id === messageId);
    if (!msg) return;
    socketRef.current?.emit('react-message', { messageId, chatId: msg.chat, emoji });
    setCtxMsg(null);
  };

  const handleDelete = (messageId, deleteFor) => {
    const msg = messages.find(m => m._id === messageId);
    if (!msg) return;
    socketRef.current?.emit('delete-message', { messageId, chatId: msg.chat, deleteFor });
    setCtxMsg(null);
  };

  // ── Render ─────────────────────────────────────────────────────
  const filteredChats = search.trim()
    ? chats.filter(c => c.participant.name.toLowerCase().includes(search.toLowerCase()))
    : chats;

  const filteredUsers = userSearch.trim()
    ? allUsers.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
    : allUsers;

  const openNewChat = async () => {
    setShowNewChat(true);
    setLoadingUsers(true);
    try {
      const res = await apiCall(tokenRef.current, 'GET', '/users');
      setAllUsers(res.data.filter(u => u._id !== myDbUser?._id));
    } catch (e) {
      console.error(e);
    }
    setLoadingUsers(false);
  };

  const startChat = async (user) => {
    try {
      const res = await apiCall(tokenRef.current, 'POST', `/chats/with/${user._id}`);
      const chat = res.data;
      setChats(prev => prev.find(c => c._id === chat._id) ? prev : [chat, ...prev]);
      setActiveChatId(chat._id);
      setShowNewChat(false);
      setUserSearch('');
    } catch (e) {
      console.error(e);
    }
  };

  const isTyping = activeChatId ? typingUsers.get(activeChatId) === activeChat?.participant?._id : false;

  // Build list with date separators
  const buildList = (msgs) => {
    const items = [];
    let lastDate = null;
    for (const msg of msgs) {
      const d = new Date(msg.createdAt);
      if (!lastDate || !isSameDay(lastDate, d)) {
        items.push({ type: 'sep', key: `sep-${msg.createdAt}`, date: msg.createdAt });
        lastDate = d;
      }
      items.push({ type: 'msg', key: msg._id, msg });
    }
    return items;
  };

  const listItems = buildList(messages);

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Chats</h2>
          <button onClick={openNewChat} style={{ background: 'var(--primary)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            +
          </button>
        </div>
        <div className="sidebar-search">
          <div className="search-input-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Search conversations…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="chat-list">
          {loadingChats ? (
            <div className="loader" style={{ height: 200 }}><div className="spinner" /></div>
          ) : filteredChats.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>No conversations yet</div>
          ) : filteredChats.map(chat => {
            const p = chat.participant;
            const isOnline = onlineUsers.has(p._id);
            const hasUnread = unreadChats.has(chat._id);
            const isActive = chat._id === activeChatId;
            const typing = typingUsers.get(chat._id) === p._id;
            const lastText = chat.lastMessage?.text ?? '';
            return (
              <div key={chat._id} className={`chat-item ${isActive ? 'active' : ''}`} onClick={() => setActiveChatId(chat._id)}>
                <div className="chat-item-avatar">
                  <img src={p.avatar} alt={p.name} />
                  {isOnline && <span className="online-dot" />}
                </div>
                <div className="chat-item-info">
                  <div className="chat-item-top">
                    <span className="chat-item-name">{p.name}</span>
                    <span className="chat-item-time">
                      {chat.lastMessageAt ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: false }) : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className={`chat-item-preview ${hasUnread ? 'unread' : ''} ${lastText === '📞 Missed call' ? 'missed' : ''}`}>
                      {typing ? <em style={{ color: 'var(--primary)' }}>typing…</em> : (lastText || 'No messages yet')}
                    </div>
                    {hasUnread && <span className="unread-dot" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* User row */}
        <div className="user-menu-btn">
          <img src={user?.imageUrl} alt={user?.firstName} />
          <span className="user-name">{user?.firstName} {user?.lastName}</span>
          <UserButton />
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────────────── */}
      {!activeChatId ? (
        <div className="empty-pane">
          <div className="icon">💬</div>
          <h3>Select a chat</h3>
          <p>Pick a conversation from the sidebar to start messaging.</p>
        </div>
      ) : (
        <div className="chat-area">
          {/* Header */}
          <div className="chat-header">
            <img src={activeChat?.participant?.avatar} alt={activeChat?.participant?.name} />
            <div className="chat-header-info">
              <h3>{activeChat?.participant?.name}</h3>
              <div className={`chat-header-status ${
                isTyping ? 'status-typing' :
                onlineUsers.has(activeChat?.participant?._id) ? 'status-online' : 'status-offline'
              }`}>
                {isTyping ? 'typing…'
                  : onlineUsers.has(activeChat?.participant?._id) ? 'Online'
                  : lastSeenMap.has(activeChat?.participant?._id)
                    ? `Last seen ${formatDistanceToNow(new Date(lastSeenMap.get(activeChat.participant._id)), { addSuffix: true })}`
                    : 'Offline'}
              </div>
            </div>
          </div>

          {/* Messages */}
          {loadingMsgs ? (
            <div className="loader"><div className="spinner" /></div>
          ) : (
            <div className="messages-area">
              {listItems.map(item => {
                if (item.type === 'sep') return (
                  <div key={item.key} className="date-sep"><span>{dateSep(item.date)}</span></div>
                );
                const { msg } = item;
                const isFromMe = (msg.sender?._id ?? msg.sender) === myDbUser?._id;
                const isRead = isFromMe && (msg.readBy?.length > 1 || msg.readBy?.includes('read'));
                const isDeleted = msg.isDeleted;
                const isSystem = msg.type === 'system';

                if (isSystem) return (
                  <div key={msg._id} className="system-msg"><span>{msg.text}</span></div>
                );

                const timeStr = format(new Date(msg.createdAt), 'HH:mm');
                const isOptimistic = msg._id.startsWith('temp-');

                return (
                  <div key={msg._id} className={`msg-row ${isFromMe ? 'from-me' : 'from-them'}`}
                    onContextMenu={e => { e.preventDefault(); if (!isDeleted) setCtxMsg(msg); }}>
                    <div className="bubble-wrap">
                      {msg.replyTo && !isDeleted && (
                        <div className="reply-quote">
                          <div className="reply-quote-sender">{msg.replyTo.senderName}</div>
                          <div className="reply-quote-text">{msg.replyTo.text}</div>
                        </div>
                      )}
                      <div className={`bubble ${isDeleted ? 'deleted' : ''}`}
                        onDoubleClick={() => !isDeleted && setReplyTo({ _id: msg._id, text: msg.text, senderName: msg.sender?.name ?? 'Someone' })}>
                        {isDeleted ? '🚫 This message was deleted' : msg.text}
                        <div className="bubble-meta">
                          <span className="bubble-time">{timeStr}</span>
                          {isFromMe && !isDeleted && (
                            <span className={`tick ${isRead ? 'read' : 'sent'}`}>
                              {isOptimistic ? '🕐' : '✓✓'}
                            </span>
                          )}
                        </div>
                      </div>
                      {(msg.reactions?.length > 0) && (
                        <div className="reactions">
                          {Object.entries(msg.reactions.reduce((a, r) => { a[r.emoji] = (a[r.emoji] || 0) + 1; return a; }, {})).map(([emoji, count]) => (
                            <button key={emoji} className="reaction-pill" onClick={() => handleReact(msg._id, emoji)}>
                              {emoji}{count > 1 && ` ${count}`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isTyping && (
                <div className="msg-row from-them">
                  <div className="typing-dots"><span /><span /><span /></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Reply bar */}
          {replyTo && (
            <div className="reply-bar">
              <div className="reply-bar-text">
                <div className="reply-bar-sender">{replyTo.senderName}</div>
                <div className="reply-bar-preview">{replyTo.text}</div>
              </div>
              <button className="reply-bar-close" onClick={() => setReplyTo(null)}>×</button>
            </div>
          )}

          {/* Input */}
          <div className="input-bar">
            <div className="input-wrap">
              <textarea
                placeholder="Message…"
                value={text}
                onChange={handleTypingChange}
                onKeyDown={handleKeyDown}
                rows={1}
                style={{ height: 'auto' }}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              />
            </div>
            <button className="send-btn" onClick={handleSend} disabled={!text.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Context menu ─────────────────────────────────────────── */}
      {ctxMsg && (
        <div className="ctx-overlay" onClick={() => setCtxMsg(null)}>
          <div className="ctx-menu" onClick={e => e.stopPropagation()}>
            <div className="ctx-emoji-row">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} className="ctx-emoji-btn" onClick={() => handleReact(ctxMsg._id, e)}>{e}</button>
              ))}
            </div>
            <button className="ctx-action" onClick={() => { setReplyTo({ _id: ctxMsg._id, text: ctxMsg.text, senderName: ctxMsg.sender?.name ?? 'Someone' }); setCtxMsg(null); }}>
              ↩ Reply
            </button>
            <button className="ctx-action" onClick={() => { navigator.clipboard.writeText(ctxMsg.text); setCtxMsg(null); }}>
              📋 Copy
            </button>
            {(ctxMsg.sender?._id ?? ctxMsg.sender) === myDbUser?._id && (
              <>
                <button className="ctx-action danger" onClick={() => handleDelete(ctxMsg._id, 'everyone')}>🗑 Delete for Everyone</button>
                <button className="ctx-action danger" onClick={() => handleDelete(ctxMsg._id, 'me')}>🗑 Delete for Me</button>
              </>
            )}
            <button className="ctx-action" onClick={() => setCtxMsg(null)}>Cancel</button>
          </div>
        </div>
      {/* ── New Chat Modal ────────────────────────────────────────── */}
      {showNewChat && (
        <div className="ctx-overlay" onClick={() => setShowNewChat(false)} style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="ctx-menu" onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '100%', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>Start a New Chat</h3>
              <button onClick={() => setShowNewChat(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            
            <div className="search-input-wrap" style={{ margin: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input placeholder="Search users by name..." value={userSearch} onChange={e => setUserSearch(e.target.value)} autoFocus />
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loadingUsers ? (
                <div className="loader"><div className="spinner" /></div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No users found</div>
              ) : filteredUsers.map(u => (
                <div key={u._id} onClick={() => startChat(u)} className="chat-item" style={{ borderRadius: 12 }}>
                  <div className="chat-item-avatar"><img src={u.avatar} alt={u.name} /></div>
                  <div className="chat-item-info">
                    <span className="chat-item-name">{u.name}</span>
                    <div className="chat-item-preview">{u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return (
    <div className="loader" style={{ height: '100dvh' }}><div className="spinner" /></div>
  );

  return isSignedIn ? <ChatApp /> : <AuthScreen />;
}