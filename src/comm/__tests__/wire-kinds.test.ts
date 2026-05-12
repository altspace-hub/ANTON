/**
 * wire-kinds.test.ts — applyInbound* round-trips for every Wassup wire
 * kind. Each test simulates a peer's payload landing on the inbound
 * path and asserts the local IDB state shifts to the expected shape.
 *
 * Why these wires get their own file: ChatMessage mutators are covered
 * in mutator-authorship.test.ts. The Wassup branches sit in a separate
 * IDB store (wassup_posts + wassup_interactions) with their own
 * authorship rules — wassup_delete refuses unless authorHash matches
 * the post's stored authorHash; comments + likes are openly applied.
 *
 * Each test uses a fresh post id so concurrent cases don't collide.
 */
import { describe, it, expect } from 'vitest';
import {
  applyInboundPost,
  applyInboundLike,
  applyInboundComment,
  applyInboundDelete,
  getPost,
  listInteractions,
  generatePostId,
  type WassupPostWire,
  type WassupLikeWire,
  type WassupCommentWire,
  type WassupDeleteWire,
} from '../services/wassup';

const ALICE = 'ANTON-AAAA-AAAA-AAAA-AAAA';
const BOB = 'ANTON-BBBB-BBBB-BBBB-BBBB';
const MALLORY = 'ANTON-MMMM-MMMM-MMMM-MMMM';

function postWire(overrides: Partial<WassupPostWire> = {}): WassupPostWire {
  return {
    postId: generatePostId(),
    authorHash: ALICE,
    authorName: 'Alice',
    text: 'hello world',
    createdAt: new Date().toISOString(),
    expiresAt: null,
    ...overrides,
  };
}

describe('wassup_post inbound', () => {
  it('persists a text post with default counters', async () => {
    const wire = postWire();
    await applyInboundPost(wire);
    const post = await getPost(wire.postId);
    expect(post).not.toBeNull();
    expect(post?.text).toBe('hello world');
    expect(post?.authorHash).toBe(ALICE);
    expect(post?.likeCount).toBe(0);
    expect(post?.commentCount).toBe(0);
    expect(post?.seen).toBe(false);
  });

  it('is idempotent — applying the same post twice does not duplicate', async () => {
    const wire = postWire({ text: 'idempotent' });
    await applyInboundPost(wire);
    await applyInboundPost({ ...wire, text: 'attempt to overwrite' });
    const post = await getPost(wire.postId);
    // De-dupe keeps the first text, not the second.
    expect(post?.text).toBe('idempotent');
  });

  it('persists optional image + voice attachments', async () => {
    const wire = postWire({
      image: { data: 'aGV5', mimeType: 'image/png', width: 100, height: 50 },
      voice: { audio: 'YXVk', mimeType: 'audio/webm', durationSec: 3.5, waveform: [0.1, 0.5], size: 1024 },
    });
    await applyInboundPost(wire);
    const post = await getPost(wire.postId);
    expect(post?.image?.mimeType).toBe('image/png');
    expect(post?.voice?.durationSec).toBe(3.5);
  });
});

describe('wassup_like inbound', () => {
  async function seedPost(): Promise<string> {
    const wire = postWire();
    await applyInboundPost(wire);
    return wire.postId;
  }

  it('adds a like and bumps the post counter', async () => {
    const postId = await seedPost();
    const wire: WassupLikeWire = { postId, reactorHash: BOB, reactorName: 'Bob', op: 'add' };
    await applyInboundLike(wire);
    const post = await getPost(postId);
    expect(post?.likeCount).toBe(1);
    const ints = await listInteractions(postId);
    expect(ints.filter((i) => i.kind === 'like').length).toBe(1);
  });

  it('is idempotent — adding the same like twice still leaves count at 1', async () => {
    const postId = await seedPost();
    const wire: WassupLikeWire = { postId, reactorHash: BOB, reactorName: 'Bob', op: 'add' };
    await applyInboundLike(wire);
    await applyInboundLike(wire);
    const post = await getPost(postId);
    expect(post?.likeCount).toBe(1);
  });

  it('removes a like and decrements the counter', async () => {
    const postId = await seedPost();
    await applyInboundLike({ postId, reactorHash: BOB, reactorName: 'Bob', op: 'add' });
    await applyInboundLike({ postId, reactorHash: BOB, reactorName: 'Bob', op: 'remove' });
    const post = await getPost(postId);
    expect(post?.likeCount).toBe(0);
  });
});

describe('wassup_comment inbound', () => {
  it('appends a comment and bumps the comment counter', async () => {
    const wire = postWire();
    await applyInboundPost(wire);
    const commentWire: WassupCommentWire = {
      postId: wire.postId,
      commenterHash: BOB,
      commenterName: 'Bob',
      text: 'nice post',
      ts: new Date().toISOString(),
    };
    await applyInboundComment(commentWire);
    const post = await getPost(wire.postId);
    expect(post?.commentCount).toBe(1);
    const ints = await listInteractions(wire.postId);
    const comments = ints.filter((i) => i.kind === 'comment');
    expect(comments[0].text).toBe('nice post');
    expect(comments[0].fromHash).toBe(BOB);
  });
});

describe('wassup_delete inbound', () => {
  it('removes the post when the deleter is the original author', async () => {
    const wire = postWire();
    await applyInboundPost(wire);
    const delWire: WassupDeleteWire = { postId: wire.postId, authorHash: ALICE };
    await applyInboundDelete(delWire);
    const post = await getPost(wire.postId);
    expect(post).toBeNull();
  });

  it('refuses to delete when the claimed author is not the original author', async () => {
    const wire = postWire();
    await applyInboundPost(wire);
    const delWire: WassupDeleteWire = { postId: wire.postId, authorHash: MALLORY };
    await applyInboundDelete(delWire);
    const post = await getPost(wire.postId);
    expect(post).not.toBeNull();
    expect(post?.authorHash).toBe(ALICE);
  });

  it('is a no-op for an unknown post id (de-dupe with prior delete sweep)', async () => {
    const delWire: WassupDeleteWire = { postId: generatePostId(), authorHash: ALICE };
    await applyInboundDelete(delWire); // does not throw
    // Nothing to assert beyond non-throwing — the row doesn't exist.
    expect(true).toBe(true);
  });
});
