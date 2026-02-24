import React from 'react';
import { EntityNode } from './types';
import { formatDistanceToNow } from 'date-fns';

interface EntityHeatMapCellProps {
  entity: EntityNode;
  size: number;
  onClick?: () => void;
}

export function EntityHeatMapCell({ entity, size, onClick }: EntityHeatMapCellProps) {
  // Calculate color intensity based on last_seen (more recent = brighter)
  const daysSinceLastSeen = (Date.now() - new Date(entity.last_seen).getTime()) / (1000 * 60 * 60 * 24);
  const intensity = Math.max(0.3, Math.min(1, 1 - daysSinceLastSeen / 30));

  // Size multiplier (min 80px, max 240px)
  const sizeInPx = Math.min(240, Math.max(80, 80 + size * 20));

  const relativeTime = formatDistanceToNow(new Date(entity.last_seen), { addSuffix: true });

  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-adv-teal-dim hover:border-adv-teal transition-all cursor-pointer flex flex-col justify-center items-center p-3 text-center"
      style={{
        width: `${sizeInPx}px`,
        height: `${sizeInPx}px`,
        backgroundColor: `rgba(45, 212, 168, ${intensity * 0.15})`,
      }}
    >
      <div className="text-sm font-semibold text-adv-white truncate max-w-full px-1">
        {entity.entity_id}
      </div>
      <div className="text-xs text-adv-gray mt-1">
        {entity.entity_type}
      </div>
      <div className="text-xs text-adv-teal mt-2 font-mono">
        {entity.interaction_count} interactions
      </div>
      <div className="text-xs text-adv-gray-med mt-1">
        {relativeTime}
      </div>
    </div>
  );
}
