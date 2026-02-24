import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface EntityNode {
  id: string;
  entity_type: string;
  entity_id: string;
  canonical_name: string;
  interaction_count: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface EntityRelationship {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship_type: string;
  strength: number;
  observation_count: number;
}

interface KnowledgeGraphViewerProps {
  centerEntityType: string;
  centerEntityId: string;
  maxDepth?: number;
  onNodeClick?: (node: EntityNode) => void;
}

const ENTITY_TYPE_COLORS: Record<string, string> = {
  regulation: '#3498DB',
  institution: '#9B59B6',
  topic: '#E67E22',
  person: '#1ABC9C',
  document: '#F39C12',
  default: '#95A5A6',
};

export default function KnowledgeGraphViewer({
  centerEntityType,
  centerEntityId,
  maxDepth = 2,
  onNodeClick,
}: KnowledgeGraphViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<EntityNode[]>([]);
  const [edges, setEdges] = useState<EntityRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const animationRef = useRef<number>();
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const selectedNodeRef = useRef<string | null>(null);

  useEffect(() => {
    fetchSubgraph();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [centerEntityType, centerEntityId, maxDepth]);

  async function fetchSubgraph() {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/knowledge-graph/entities/${encodeURIComponent(centerEntityType)}/${encodeURIComponent(centerEntityId)}/subgraph?maxDepth=${maxDepth}`
      );
      const data = await response.json();

      // Initialize positions with force-directed layout simulation
      const width = canvasRef.current?.width || 800;
      const height = canvasRef.current?.height || 600;

      const initializedNodes = data.nodes.map((node: EntityNode, i: number) => ({
        ...node,
        x: width / 2 + (Math.random() - 0.5) * 100,
        y: height / 2 + (Math.random() - 0.5) * 100,
        vx: 0,
        vy: 0,
      }));

      setNodes(initializedNodes);
      setEdges(data.edges);
      startSimulation(initializedNodes, data.edges);
    } catch (error) {
      console.error('Failed to fetch subgraph:', error);
    } finally {
      setLoading(false);
    }
  }

  function startSimulation(initialNodes: EntityNode[], initialEdges: EntityRelationship[]) {
    let simulationNodes = [...initialNodes];
    const iterations = 300;
    let iteration = 0;

    function simulate() {
      if (iteration >= iterations) {
        setNodes([...simulationNodes]);
        render(simulationNodes, initialEdges);
        return;
      }

      // Simple force-directed layout
      const alpha = 1 - iteration / iterations;
      const chargeStrength = -300;
      const linkDistance = 80;
      const centerStrength = 0.05;

      // Center force
      const canvas = canvasRef.current;
      const centerX = (canvas?.width || 800) / 2;
      const centerY = (canvas?.height || 600) / 2;

      simulationNodes.forEach(node => {
        node.vx = (node.vx || 0) + (centerX - (node.x || 0)) * centerStrength * alpha;
        node.vy = (node.vy || 0) + (centerY - (node.y || 0)) * centerStrength * alpha;
      });

      // Charge force (repulsion)
      for (let i = 0; i < simulationNodes.length; i++) {
        for (let j = i + 1; j < simulationNodes.length; j++) {
          const a = simulationNodes[i];
          const b = simulationNodes[j];
          const dx = (b.x || 0) - (a.x || 0);
          const dy = (b.y || 0) - (a.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = chargeStrength * alpha / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          a.vx = (a.vx || 0) - fx;
          a.vy = (a.vy || 0) - fy;
          b.vx = (b.vx || 0) + fx;
          b.vy = (b.vy || 0) + fy;
        }
      }

      // Link force (attraction)
      initialEdges.forEach(edge => {
        const source = simulationNodes.find(n => n.entity_type === edge.source_type && n.entity_id === edge.source_id);
        const target = simulationNodes.find(n => n.entity_type === edge.target_type && n.entity_id === edge.target_id);
        if (!source || !target) return;

        const dx = (target.x || 0) - (source.x || 0);
        const dy = (target.y || 0) - (source.y || 0);
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (distance - linkDistance) * 0.1 * alpha;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        source.vx = (source.vx || 0) + fx;
        source.vy = (source.vy || 0) + fy;
        target.vx = (target.vx || 0) - fx;
        target.vy = (target.vy || 0) - fy;
      });

      // Update positions
      simulationNodes.forEach(node => {
        node.x = (node.x || 0) + (node.vx || 0);
        node.y = (node.y || 0) + (node.vy || 0);
        node.vx = (node.vx || 0) * 0.9;
        node.vy = (node.vy || 0) * 0.9;
      });

      iteration++;
      if (iteration % 10 === 0) {
        setNodes([...simulationNodes]);
        render(simulationNodes, initialEdges);
      }
      animationRef.current = requestAnimationFrame(simulate);
    }

    simulate();
  }

  function render(renderNodes: EntityNode[], renderEdges: EntityRelationship[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply transform
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Draw edges
    renderEdges.forEach(edge => {
      const source = renderNodes.find(n => n.entity_type === edge.source_type && n.entity_id === edge.source_id);
      const target = renderNodes.find(n => n.entity_type === edge.target_type && n.entity_id === edge.target_id);
      if (!source || !target) return;

      ctx.beginPath();
      ctx.moveTo(source.x || 0, source.y || 0);
      ctx.lineTo(target.x || 0, target.y || 0);
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(edge.strength / 5, 0.6)})`;
      ctx.lineWidth = Math.max(edge.strength, 1);
      ctx.stroke();
    });

    // Draw nodes
    renderNodes.forEach(node => {
      const isCenter = node.entity_type === centerEntityType && node.entity_id === centerEntityId;
      const isSelected = selectedNodeRef.current === `${node.entity_type}:${node.entity_id}`;
      const radius = isCenter ? 12 : Math.max(5, Math.log(node.interaction_count + 1) * 3);
      const color = ENTITY_TYPE_COLORS[node.entity_type] || ENTITY_TYPE_COLORS.default;

      ctx.beginPath();
      ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (isCenter || isSelected) {
        ctx.strokeStyle = '#2DD4A8';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Draw label
      ctx.fillStyle = '#E0E0E0';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.canonical_name.slice(0, 20), node.x || 0, (node.y || 0) + radius + 12);
    });

    ctx.restore();
  }

  useEffect(() => {
    if (nodes.length > 0 && edges.length > 0) {
      render(nodes, edges);
    }
  }, [nodes, edges, transform]);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * delta)),
    }));
  }

  function handleMouseDown(e: React.MouseEvent) {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDraggingRef.current) return;
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    }));
  }

  function handleMouseUp() {
    isDraggingRef.current = false;
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;

    // Find clicked node
    for (const node of nodes) {
      const dx = x - (node.x || 0);
      const dy = y - (node.y || 0);
      const radius = Math.max(5, Math.log(node.interaction_count + 1) * 3);
      if (dx * dx + dy * dy < radius * radius) {
        selectedNodeRef.current = `${node.entity_type}:${node.entity_id}`;
        render(nodes, edges);
        onNodeClick?.(node);
        return;
      }
    }
  }

  function zoomIn() {
    setTransform(prev => ({ ...prev, scale: Math.min(5, prev.scale * 1.2) }));
  }

  function zoomOut() {
    setTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }));
  }

  function resetView() {
    setTransform({ x: 0, y: 0, scale: 1 });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-adv-gray">Loading graph...</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="w-full h-full bg-adv-dark-2 rounded cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      />
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          onClick={zoomIn}
          className="p-2 bg-adv-card hover:bg-adv-teal-dim rounded text-adv-teal"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={zoomOut}
          className="p-2 bg-adv-card hover:bg-adv-teal-dim rounded text-adv-teal"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={resetView}
          className="p-2 bg-adv-card hover:bg-adv-teal-dim rounded text-adv-teal"
          title="Reset View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
      <div className="absolute bottom-4 left-4 bg-adv-card p-3 rounded text-xs">
        <div className="font-semibold text-adv-white mb-2">Entity Types</div>
        {Object.entries(ENTITY_TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2 text-adv-gray">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
