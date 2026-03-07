import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send, LogOut, Users, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';
import {
  joinStudyRoom,
  leaveStudyRoom,
  sendRoomMessage,
  type StudyRoomMessage,
  type StudyRoomPresence,
} from '@/lib/socket';
import type { Socket } from 'socket.io-client';

interface RoomInfo {
  id: string;
  name: string;
  subject_id: string;
  join_code: string;
  host_name: string;
}

interface ChatEntry {
  id: string;
  socketId: string;
  displayName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export default function StudyRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('school');
  const { user } = useAuthStore();

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [participants, setParticipants] = useState<Map<string, string>>(new Map());
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const displayName = user?.display_name || user?.username || 'Anonymous';

  useEffect(() => {
    if (!roomId) return;
    loadRoom();
    return () => leaveStudyRoom();
  }, [roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadRoom() {
    try {
      const res = await fetch(`/api/school/study-rooms/${roomId}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json() as RoomInfo;
        setRoomInfo(data);
        connectSocket(roomId!);
      } else {
        navigate('/school/study-rooms');
      }
    } catch {
      navigate('/school/study-rooms');
    } finally {
      setLoading(false);
    }
  }

  const addMessage = useCallback((entry: ChatEntry) => {
    setMessages(prev => [...prev, entry]);
  }, []);

  function connectSocket(rid: string) {
    const socket = joinStudyRoom(rid, displayName);
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('user:joined', (data: StudyRoomPresence) => {
      setParticipants(prev => new Map(prev).set(data.socketId, data.displayName));
      addMessage({
        id: `sys-${Date.now()}`,
        socketId: 'system',
        displayName: 'System',
        text: `${data.displayName} joined the room`,
        timestamp: data.timestamp,
        isSystem: true,
      });
    });

    socket.on('user:left', (data: StudyRoomPresence) => {
      setParticipants(prev => {
        const next = new Map(prev);
        next.delete(data.socketId);
        return next;
      });
      addMessage({
        id: `sys-${Date.now()}`,
        socketId: 'system',
        displayName: 'System',
        text: `${data.displayName} left the room`,
        timestamp: data.timestamp,
        isSystem: true,
      });
    });

    socket.on('message', (data: StudyRoomMessage) => {
      addMessage({
        id: `msg-${data.socketId}-${data.timestamp}`,
        socketId: data.socketId,
        displayName: data.displayName,
        text: data.text,
        timestamp: data.timestamp,
      });
    });
  }

  function handleSend() {
    const text = input.trim();
    if (!text || !connected) return;
    sendRoomMessage(text, displayName);
    setInput('');
  }

  function handleLeave() {
    leaveStudyRoom();
    navigate('/school/study-rooms');
  }

  if (loading) {
    return (
      <SchoolLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-adv-teal animate-spin" />
        </div>
      </SchoolLayout>
    );
  }

  return (
    <SchoolLayout>
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{roomInfo?.name ?? 'Study Room'}</h1>
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {connected ? t('studyRoom.connected', { defaultValue: 'Live' }) : t('studyRoom.disconnected', { defaultValue: 'Disconnected' })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-adv-gray mt-1">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {participants.size} {t('studyRoom.participants', { defaultValue: 'in room' })}
              </span>
              {roomInfo?.join_code && (
                <span className="font-mono bg-adv-dark border border-white/10 px-1.5 py-0.5 rounded text-adv-teal">
                  {roomInfo.join_code}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleLeave}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 border border-red-500/20 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t('studyRoom.leave', { defaultValue: 'Leave' })}
          </button>
        </div>

        {/* Participants */}
        {participants.size > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 shrink-0">
            {Array.from(participants.values()).map(name => (
              <span key={name} className="text-xs bg-adv-teal/10 text-adv-teal px-2 py-0.5 rounded-full">
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-adv-card border border-white/10 rounded-xl p-4 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-adv-gray text-sm">
              {t('studyRoom.empty', { defaultValue: 'No messages yet. Say hello!' })}
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`${msg.isSystem ? 'text-center' : ''}`}>
              {msg.isSystem ? (
                <span className="text-xs text-adv-gray italic">{msg.text}</span>
              ) : (
                <div className={`flex flex-col ${msg.socketId === socketRef.current?.id ? 'items-end' : 'items-start'}`}>
                  <span className="text-xs text-adv-gray mb-1">{msg.displayName}</span>
                  <div className={`max-w-xs lg:max-w-md rounded-xl px-3 py-2 text-sm ${
                    msg.socketId === socketRef.current?.id
                      ? 'bg-adv-teal text-adv-dark rounded-tr-sm'
                      : 'bg-adv-dark-2 text-adv-off-white rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-xs text-adv-gray mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 mt-3 shrink-0">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={connected
              ? t('studyRoom.placeholder', { defaultValue: 'Type a message...' })
              : t('studyRoom.connectingPlaceholder', { defaultValue: 'Connecting...' })}
            disabled={!connected}
            className="flex-1 bg-adv-card border border-white/10 rounded-xl px-4 py-3 text-white placeholder-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal text-sm disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!connected || !input.trim()}
            className="p-3 rounded-xl bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </SchoolLayout>
  );
}
