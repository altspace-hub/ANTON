import React from 'react';

export interface AvatarConfig {
  avatarChar: string;
  colorScheme: string;
  frame: string;
  title: string;
}

const COLOR_MAP: Record<string, { bg: string; ring: string; text: string }> = {
  teal:   { bg: 'bg-teal-500/20',   ring: 'ring-teal-400',   text: 'text-teal-300' },
  blue:   { bg: 'bg-blue-500/20',   ring: 'ring-blue-400',   text: 'text-blue-300' },
  purple: { bg: 'bg-purple-500/20', ring: 'ring-purple-400', text: 'text-purple-300' },
  gold:   { bg: 'bg-yellow-500/20', ring: 'ring-yellow-400', text: 'text-yellow-300' },
  red:    { bg: 'bg-red-500/20',    ring: 'ring-red-400',    text: 'text-red-300' },
  green:  { bg: 'bg-green-500/20',  ring: 'ring-green-400',  text: 'text-green-300' },
};

const FRAME_MAP: Record<string, string> = {
  none:     '',
  star:     '⭐',
  crown:    '👑',
  fire:     '🔥',
  diamond:  '💎',
  lightning: '⚡',
};

interface AvatarDisplayProps {
  avatar: AvatarConfig;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTitle?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm:  { outer: 'w-8 h-8',  emoji: 'text-lg',  ring: 'ring-1' },
  md:  { outer: 'w-12 h-12', emoji: 'text-2xl', ring: 'ring-2' },
  lg:  { outer: 'w-16 h-16', emoji: 'text-3xl', ring: 'ring-2' },
  xl:  { outer: 'w-24 h-24', emoji: 'text-5xl', ring: 'ring-4' },
};

export default function AvatarDisplay({
  avatar,
  size = 'md',
  showTitle = false,
  className = '',
}: AvatarDisplayProps) {
  const colors = COLOR_MAP[avatar.colorScheme] ?? COLOR_MAP['teal'];
  const sz = SIZE_MAP[size];
  const frameEmoji = FRAME_MAP[avatar.frame] ?? '';

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className={`relative ${sz.outer} rounded-full ${colors.bg} ${colors.ring} ${sz.ring} flex items-center justify-center select-none`}>
        <span className={sz.emoji} role="img" aria-label="avatar">
          {avatar.avatarChar}
        </span>
        {frameEmoji && (
          <span className="absolute -top-1 -right-1 text-sm" role="img" aria-label="frame">
            {frameEmoji}
          </span>
        )}
      </div>
      {showTitle && avatar.title && (
        <span className={`text-xs font-semibold ${colors.text}`}>{avatar.title}</span>
      )}
    </div>
  );
}

// ── Preset avatars available in the picker ───────────────────────────────────
export const AVATAR_CHARS = [
  '🦊', '🐺', '🦁', '🐯', '🐻', '🐼', '🐨', '🦄', '🐲', '🦅',
  '🦋', '🦉', '🐬', '🦈', '🐙', '🦕', '🤖', '👾', '🧙', '🧚',
  '⚡', '🌟', '🔥', '❄️', '🌊', '🌿', '🎮', '🎸', '🎨', '📚',
];

export const COLOR_SCHEMES = [
  { id: 'teal',   label: 'Teal',   preview: 'bg-teal-400' },
  { id: 'blue',   label: 'Blue',   preview: 'bg-blue-400' },
  { id: 'purple', label: 'Purple', preview: 'bg-purple-400' },
  { id: 'gold',   label: 'Gold',   preview: 'bg-yellow-400' },
  { id: 'red',    label: 'Red',    preview: 'bg-red-400' },
  { id: 'green',  label: 'Green',  preview: 'bg-green-400' },
];

export const FRAMES = [
  { id: 'none',      label: 'None',      emoji: '' },
  { id: 'star',      label: 'Star',      emoji: '⭐' },
  { id: 'crown',     label: 'Crown',     emoji: '👑' },
  { id: 'fire',      label: 'Fire',      emoji: '🔥' },
  { id: 'diamond',   label: 'Diamond',   emoji: '💎' },
  { id: 'lightning', label: 'Lightning', emoji: '⚡' },
];
