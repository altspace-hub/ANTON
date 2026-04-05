import type { DatabaseAdapter } from '../db/database.js';

export async function createKnowledgeSharingService(db: DatabaseAdapter) {

  async function shareAtom(atomId: string, recipientHash: string): Promise<{ mailId: string; sharedAtomId: string }> {
    // Load atom
    const atom = await db.get<Record<string, unknown>>(
      'SELECT * FROM market_atoms WHERE id = ?', atomId
    );
    if (!atom) throw new Error(`Atom not found: ${atomId}`);

    // Get sender identity
    const identity = await db.get<{ contact_hash: string; display_name: string }>(
      'SELECT contact_hash, display_name FROM community_identity LIMIT 1'
    );

    // Validate connection
    const conn = await db.get<{ id: string }>(
      "SELECT id FROM community_connections WHERE contact_hash = ? AND status IN ('accepted', 'active')",
      recipientHash
    );
    if (!conn) throw new Error(`No active connection with ${recipientHash}`);

    // Build payload
    const payload = {
      atom: {
        id: atom.id, content: atom.content, atom_type: atom.atom_type,
        confidence: atom.confidence, category: atom.category,
        subcategory: atom.subcategory, sentiment: atom.sentiment,
        entities: atom.entities, importance_score: atom.importance_score,
        horizon: atom.horizon, decay_rate: atom.decay_rate,
      },
      provenance: {
        senderHash: identity?.contact_hash ?? 'unknown',
        senderName: identity?.display_name ?? 'ANTON',
        originalAtomId: atomId,
        sharedAt: new Date().toISOString(),
      },
    };

    // Create mail — use from_hash / to_hashes to match community_mail schema
    const mailId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const contentSnippet = String(atom.content).slice(0, 100);
    await db.run(`
      INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload)
      VALUES (?, ?, ?, ?, ?, 'sent', 'knowledge_share', ?)
    `, mailId, identity?.contact_hash ?? 'self', JSON.stringify([recipientHash]),
       `[Atom] ${contentSnippet}`, contentSnippet, JSON.stringify(payload));

    // Record sharing
    const sharedAtomId = `csa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_shared_atoms (id, atom_id, original_atom_id, direction, contact_hash, mail_id, status)
      VALUES (?, ?, ?, 'sent', ?, ?, 'accepted')
    `, sharedAtomId, atomId, atomId, recipientHash, mailId);

    return { mailId, sharedAtomId };
  }

  async function receiveSharedAtom(mailId: string): Promise<{ status: string; atomId?: string; conflictAtomId?: string }> {
    const mail = await db.get<{ payload: string; from_hash: string }>(
      "SELECT payload, from_hash FROM community_mail WHERE id = ? AND message_type = 'knowledge_share'", mailId
    );
    if (!mail) throw new Error(`Mail not found: ${mailId}`);

    const payload = typeof mail.payload === 'string' ? JSON.parse(mail.payload) : mail.payload;
    const atomData = payload.atom;

    // Check import policy
    const { createStructuredMessageHandler } = await import('./structured-message-handler.js');
    const handler = await createStructuredMessageHandler(db);
    const policy = await handler.shouldAutoProcess(mail.from_hash, 'knowledge_share');

    if (policy === 'block') {
      await db.run(`
        INSERT INTO community_shared_atoms (id, atom_id, original_atom_id, direction, contact_hash, mail_id, status)
        VALUES (?, ?, ?, 'received', ?, ?, 'rejected')
      `, `csa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, 'blocked', atomData.id, mail.from_hash, mailId);
      return { status: 'blocked' };
    }

    // Check for conflicts (same entity + opposite sentiment)
    let conflictAtomId: string | undefined;
    if (atomData.entities) {
      const entities = typeof atomData.entities === 'string' ? JSON.parse(atomData.entities) : atomData.entities;
      for (const ent of entities) {
        const conflicting = await db.get<{ id: string }>(
          `SELECT id FROM market_atoms WHERE is_active = 1
           AND entities::text LIKE ? AND sentiment != ? AND sentiment IS NOT NULL
           AND created_at > NOW() - INTERVAL '7 days'
           LIMIT 1`,
          `%${ent.id}%`, atomData.sentiment ?? 'neutral'
        );
        if (conflicting) { conflictAtomId = conflicting.id; break; }
      }
    }

    if (policy === 'ask' && !conflictAtomId) {
      const csaId = `csa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(`
        INSERT INTO community_shared_atoms (id, atom_id, original_atom_id, direction, contact_hash, mail_id, status)
        VALUES (?, ?, ?, 'received', ?, ?, 'pending')
      `, csaId, 'pending', atomData.id, mail.from_hash, mailId);
      return { status: 'pending' };
    }

    if (conflictAtomId) {
      const csaId = `csa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(`
        INSERT INTO community_shared_atoms (id, atom_id, original_atom_id, direction, contact_hash, mail_id, status, conflict_atom_id, conflict_reason)
        VALUES (?, ?, ?, 'received', ?, ?, 'conflict', ?, ?)
      `, csaId, 'conflict', atomData.id, mail.from_hash, mailId, conflictAtomId, 'Opposite sentiment on same entity');
      return { status: 'conflict', conflictAtomId };
    }

    // Import the atom
    const { createMarketAtomService } = await import('./market-atom-service.js');
    const atomService = await createMarketAtomService(db);
    const newAtomId = await atomService.createAtom({
      content: atomData.content,
      atomType: atomData.atom_type,
      confidence: Math.min(Number(atomData.confidence) * 0.9, 1), // slight confidence reduction for shared atoms
      category: atomData.category,
      subcategory: atomData.subcategory,
      sentiment: atomData.sentiment,
      importanceScore: atomData.importance_score,
      horizon: atomData.horizon,
      decayRate: atomData.decay_rate ?? 0.05,
      entities: typeof atomData.entities === 'string' ? JSON.parse(atomData.entities) : atomData.entities,
      extractionMethod: 'community_share',
    });

    // Set provenance metadata on the imported atom
    const sourceInstanceId = payload.source_instance_id || atomData.source_instance_id || null;
    const connectionTrust = await db.get<{ status: string }>(
      "SELECT status FROM community_connections WHERE contact_hash = ?", mail.from_hash
    );
    const trustLevel = connectionTrust?.status === 'accepted' ? 'trusted_peer' : 'known_peer';

    await db.run(
      "UPDATE market_atoms SET source_instance_id = ?, source_peer_hash = ?, trust_level = ? WHERE id = ?",
      sourceInstanceId, mail.from_hash, trustLevel, newAtomId
    );

    const csaId = `csa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.run(`
      INSERT INTO community_shared_atoms (id, atom_id, original_atom_id, direction, contact_hash, mail_id, status)
      VALUES (?, ?, ?, 'received', ?, ?, 'accepted')
    `, csaId, newAtomId, atomData.id, mail.from_hash, mailId);

    return { status: 'imported', atomId: newAtomId };
  }

  async function resolveSharedAtom(sharedAtomId: string, decision: 'accept' | 'reject'): Promise<{ atomId?: string }> {
    if (decision === 'reject') {
      await db.run("UPDATE community_shared_atoms SET status = 'rejected', resolved_at = NOW() WHERE id = ?", sharedAtomId);
      return {};
    }

    // Get the shared atom record to find the mail
    const shared = await db.get<{ mail_id: string; original_atom_id: string }>(
      'SELECT mail_id, original_atom_id FROM community_shared_atoms WHERE id = ?', sharedAtomId
    );
    if (!shared?.mail_id) throw new Error('Shared atom record not found');

    const result = await receiveSharedAtom(shared.mail_id);
    if (result.atomId) {
      await db.run("UPDATE community_shared_atoms SET atom_id = ?, status = 'accepted', resolved_at = NOW() WHERE id = ?", result.atomId, sharedAtomId);
    }
    return { atomId: result.atomId };
  }

  async function getSharedAtomHistory(options: { contactHash?: string; direction?: string; status?: string; limit?: number } = {}) {
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    if (options.contactHash) { where += ' AND csa.contact_hash = ?'; params.push(options.contactHash); }
    if (options.direction) { where += ' AND csa.direction = ?'; params.push(options.direction); }
    if (options.status) { where += ' AND csa.status = ?'; params.push(options.status); }
    params.push(options.limit ?? 50);

    return await db.all(
      `SELECT csa.*, ma.content as atom_content, ma.atom_type, ma.sentiment, ma.confidence as atom_confidence
       FROM community_shared_atoms csa
       LEFT JOIN market_atoms ma ON csa.atom_id = ma.id
       ${where} ORDER BY csa.shared_at DESC LIMIT ?`,
      ...params
    );
  }

  // ── Entity Graph Federation ───────────────────────────────────────────

  /**
   * Share entity nodes + relationships with a peer ANTON instance.
   * Packages entities as a structured payload and sends via P2P mail.
   */
  async function shareEntities(recipientHash: string, entityIds: string[]): Promise<{ mailId: string; count: number }> {
    const identity = await db.get<{ contact_hash: string; display_name: string }>(
      'SELECT contact_hash, display_name FROM community_identity LIMIT 1'
    );
    if (!identity) throw new Error('Community identity not activated');

    const conn = await db.get<{ id: string }>(
      "SELECT id FROM community_connections WHERE contact_hash = ? AND status IN ('accepted', 'active')",
      recipientHash
    );
    if (!conn) throw new Error(`No active connection with ${recipientHash}`);

    // Load entities
    const placeholders = entityIds.map(() => '?').join(',');
    const entities = await db.all<Record<string, unknown>>(
      `SELECT id, entity_type, entity_id, canonical_name, metadata, related_areas, source FROM entity_nodes WHERE id IN (${placeholders})`,
      ...entityIds
    );

    // Load relationships between these entities
    const relationships = await db.all<Record<string, unknown>>(
      `SELECT id, source_type, source_id, target_type, target_id, relationship_type, strength, evidence, context
       FROM entity_relationships
       WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
      ...entityIds, ...entityIds
    );

    const payload = {
      type: 'entity_sync',
      entities: entities.map(e => ({
        id: e.id, entity_type: e.entity_type, entity_id: e.entity_id,
        canonical_name: e.canonical_name, metadata: e.metadata,
        related_areas: e.related_areas, source: e.source,
      })),
      relationships: relationships.map(r => ({
        source_type: r.source_type, source_id: r.source_id,
        target_type: r.target_type, target_id: r.target_id,
        relationship_type: r.relationship_type, strength: r.strength,
        evidence: r.evidence, context: r.context,
      })),
      provenance: {
        senderHash: identity.contact_hash,
        senderName: identity.display_name,
        sharedAt: new Date().toISOString(),
      },
    };

    const mailId = `cm_efed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload)
      VALUES (?, ?, ?, ?, ?, 'sent', 'entity_sync', ?)
    `, mailId, identity.contact_hash, JSON.stringify([recipientHash]),
       `[Entity Sync] ${entities.length} entities shared`,
       `Sharing ${entities.length} entities and ${relationships.length} relationships`,
       JSON.stringify(payload));

    return { mailId, count: entities.length };
  }

  /**
   * Import federated entities from a peer.
   * Entities are marked with is_federated=1, source_peer_hash, and are read-only.
   * Local entities take precedence in case of conflict (same entity_type + entity_id).
   */
  async function receiveEntities(fromHash: string, payload: {
    entities: Array<{
      id: string; entity_type: string; entity_id: string; canonical_name: string;
      metadata?: string; related_areas?: string; source?: string;
    }>;
    relationships: Array<{
      source_type: string; source_id: string; target_type: string; target_id: string;
      relationship_type: string; strength?: number; evidence?: string; context?: string;
    }>;
    provenance: { senderHash: string; senderName: string; sharedAt: string };
  }): Promise<{ imported: number; skipped: number; relationships: number }> {
    let imported = 0, skipped = 0, relCount = 0;
    const idMapping = new Map<string, string>(); // old_id → new_id

    for (const ent of payload.entities) {
      // Skip if local entity with same type+id already exists
      const existing = await db.get<{ id: string; is_federated: number }>(
        'SELECT id, COALESCE(is_federated, 0) as is_federated FROM entity_nodes WHERE entity_type = ? AND entity_id = ?',
        ent.entity_type, ent.entity_id
      );

      if (existing && !existing.is_federated) {
        // Local entity takes precedence
        idMapping.set(ent.id, existing.id);
        skipped++;
        continue;
      }

      if (existing && existing.is_federated) {
        // Update existing federated entity
        await db.run(`
          UPDATE entity_nodes SET canonical_name = ?, metadata = ?, related_areas = ?,
            source_peer_hash = ?, last_seen = NOW()
          WHERE id = ?
        `, ent.canonical_name, ent.metadata ?? null, ent.related_areas ?? '[]',
           fromHash, existing.id);
        idMapping.set(ent.id, existing.id);
        imported++;
        continue;
      }

      // Insert new federated entity
      const newId = `efed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO entity_nodes (id, entity_type, entity_id, canonical_name, metadata, related_areas, source,
                                   source_instance_id, source_peer_hash, is_federated)
        VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, 1)
      `, newId, ent.entity_type, ent.entity_id, ent.canonical_name,
         ent.metadata ?? null, ent.related_areas ?? '[]',
         payload.provenance.senderHash, fromHash);
      idMapping.set(ent.id, newId);
      imported++;
    }

    // Import relationships (map old IDs to new IDs)
    for (const rel of payload.relationships) {
      const sourceId = idMapping.get(rel.source_id) ?? rel.source_id;
      const targetId = idMapping.get(rel.target_id) ?? rel.target_id;

      // Check both nodes exist locally
      const srcExists = await db.get<{ id: string }>('SELECT id FROM entity_nodes WHERE entity_id = ?', sourceId);
      const tgtExists = await db.get<{ id: string }>('SELECT id FROM entity_nodes WHERE entity_id = ?', targetId);
      if (!srcExists || !tgtExists) continue;

      await db.run(`
        INSERT INTO entity_relationships (source_type, source_id, target_type, target_id, relationship_type, strength, evidence, context, source_instance_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `, rel.source_type, rel.source_id, rel.target_type, rel.target_id,
         rel.relationship_type, rel.strength ?? 0.5, rel.evidence ?? null,
         rel.context ?? null, fromHash);
      relCount++;
    }

    return { imported, skipped, relationships: relCount };
  }

  /**
   * List federated entities received from peers.
   */
  async function listFederatedEntities(peerHash?: string, limit = 50): Promise<Array<Record<string, unknown>>> {
    if (peerHash) {
      return await db.all(
        'SELECT * FROM entity_nodes WHERE is_federated = 1 AND source_peer_hash = ? ORDER BY last_seen DESC LIMIT ?',
        peerHash, limit
      );
    }
    return await db.all(
      'SELECT * FROM entity_nodes WHERE is_federated = 1 ORDER BY last_seen DESC LIMIT ?', limit
    );
  }

  return {
    shareAtom, receiveSharedAtom, resolveSharedAtom, getSharedAtomHistory,
    shareEntities, receiveEntities, listFederatedEntities,
  };
}

export type KnowledgeSharingService = Awaited<ReturnType<typeof createKnowledgeSharingService>>;
