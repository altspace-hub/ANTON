import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Users, Plus, LogIn, Loader2, BookOpen, Clock } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import SchoolLayout from '@/components/school/SchoolLayout';

interface StudyRoom {
  id: string;
  name: string;
  subject_id: string;
  max_participants: number;
  join_code: string;
  created_at: string;
  host_name: string;
}

export default function StudyRoomsPage() {
  const { t } = useTranslation('school');
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Create form state
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('mathematics');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    try {
      const res = await fetch('/api/school/study-rooms', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json() as { rooms: StudyRoom[] };
        setRooms(data.rooms ?? []);
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }

  async function createRoom() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/school/study-rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ name: newName.trim(), subjectId: newSubject }),
      });
      if (res.ok) {
        const data = await res.json() as { id: string };
        setShowCreate(false);
        setNewName('');
        await loadRooms();
        // Navigate to the room
        window.location.href = `/school/study-room/${data.id}`;
      }
    } catch { /* non-fatal */ } finally {
      setCreating(false);
    }
  }

  async function joinByCode() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch('/api/school/study-rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ joinCode: joinCode.trim() }),
      });
      if (res.ok) {
        const data = await res.json() as { roomId: string };
        window.location.href = `/school/study-room/${data.roomId}`;
      } else {
        setJoinError(t('studyRooms.invalidCode', { defaultValue: 'Room not found or expired.' }));
      }
    } catch {
      setJoinError(t('studyRooms.joinError', { defaultValue: 'Could not join room.' }));
    } finally {
      setJoining(false);
    }
  }

  return (
    <SchoolLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-adv-teal/10">
              <Users className="w-6 h-6 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {t('studyRooms.title', { defaultValue: 'Study Rooms' })}
              </h1>
              <p className="text-sm text-adv-gray">
                {t('studyRooms.subtitle', { defaultValue: 'Study together in real time' })}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-adv-teal text-adv-dark font-semibold text-sm hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('studyRooms.create', { defaultValue: 'Create room' })}
          </button>
        </div>

        {/* Join by code */}
        <div className="bg-adv-card border border-white/10 rounded-xl p-4 flex gap-3">
          <input
            type="text"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder={t('studyRooms.codePlaceholder', { defaultValue: 'Enter 6-letter code...' })}
            maxLength={6}
            className="flex-1 bg-adv-dark border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm placeholder-adv-gray focus:outline-none focus:border-adv-teal uppercase"
          />
          <button
            onClick={joinByCode}
            disabled={joining || joinCode.length < 4}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-adv-blue text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {t('studyRooms.join', { defaultValue: 'Join' })}
          </button>
        </div>
        {joinError && <p className="text-red-400 text-sm">{joinError}</p>}

        {/* Create form */}
        {showCreate && (
          <div className="bg-adv-card border border-adv-teal/30 rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-white">
              {t('studyRooms.newRoom', { defaultValue: 'New study room' })}
            </h2>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t('studyRooms.roomNamePlaceholder', { defaultValue: 'e.g. Maths exam prep — Year 11' })}
              className="w-full bg-adv-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-adv-gray focus:outline-none focus:border-adv-teal"
            />
            <select
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              className="w-full bg-adv-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-adv-teal"
            >
              {['mathematics', 'physics', 'chemistry', 'biology', 'english', 'history', 'economics', 'computer-science'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={createRoom}
                disabled={creating || !newName.trim()}
                className="flex-1 py-2 rounded-lg bg-adv-teal text-adv-dark font-semibold text-sm hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('studyRooms.createBtn', { defaultValue: 'Create' })}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-adv-gray hover:text-white border border-white/10 text-sm transition-colors"
              >
                {t('studyRooms.cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          </div>
        )}

        {/* Room list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-adv-teal animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-12 text-adv-gray">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('studyRooms.noRooms', { defaultValue: 'No active study rooms. Create one to get started!' })}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map(room => (
              <Link
                key={room.id}
                to={`/school/study-room/${room.id}`}
                className="block bg-adv-card border border-white/10 rounded-xl p-4 hover:border-adv-teal/40 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white group-hover:text-adv-teal transition-colors">{room.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-adv-gray">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        {room.subject_id}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        max {room.max_participants}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(room.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-adv-gray mt-1">Hosted by {room.host_name}</p>
                  </div>
                  <div className="shrink-0">
                    <span className="font-mono text-xs bg-adv-dark border border-white/10 px-2 py-1 rounded text-adv-teal">
                      {room.join_code}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
