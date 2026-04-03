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
      "SELECT id FROM community_connections WHERE contact_hash = ? AND status = 'accepted'",
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

  return { shareAtom, receiveSharedAtom, resolveSharedAtom, getSharedAtomHistory };
}

export type KnowledgeSharingService = Awaited<ReturnType<typeof createKnowledgeSharingService>>;
