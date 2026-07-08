// Rendering the comment thread (Phase 9b). Kept out of src/recipes/view.ts
// (which carries unrelated image-credit work) per the plan's sanctioned
// alternative. Renders a nested thread: each reply's element is a descendant
// of its parent's, so the tree structure is visible in the DOM. Author names
// link to Bluesky profiles; a comment made on an older recipe revision carries
// a quiet stale marker (silent-good / loud-bad — the house trust discipline).

import { commentOnStaleRevision, type CommentNode } from './comments.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export type RenderCommentsOptions = {
  /** The recipe's current CID — comments pinned to an older CID are flagged. */
  recipeCid: string;
  /** did → handle for profile links; falls back to the DID when unknown. */
  authorsByDid?: Record<string, string>;
  /** When present (signed in), each comment gets a Reply affordance. */
  onReply?: (parentUri: string) => void;
};

const renderNode = (node: CommentNode, options: RenderCommentsOptions): HTMLElement => {
  const item = el('div', 'comment');
  item.dataset['testid'] = 'comment-item';

  const handle = options.authorsByDid?.[node.author] ?? node.author;
  const author = el('a', 'comment-author', handle) as HTMLAnchorElement;
  author.dataset['testid'] = 'comment-author';
  author.href = `https://bsky.app/profile/${handle}`;
  author.target = '_blank';
  author.rel = 'noopener';
  item.append(author);

  item.append(el('p', 'comment-text', node.text));

  if (commentOnStaleRevision(node, options.recipeCid)) {
    const stale = el('span', 'comment-stale', 'on an earlier version of this recipe');
    stale.dataset['testid'] = 'comment-stale';
    item.append(stale);
  }

  if (options.onReply !== undefined) {
    const reply = el('button', 'button comment-reply-btn', 'Reply') as HTMLButtonElement;
    reply.type = 'button';
    reply.dataset['testid'] = 'comment-reply';
    const onReply = options.onReply;
    reply.addEventListener('click', () => onReply(node.uri));
    item.append(reply);
  }

  if (node.replies.length > 0) {
    const replies = el('div', 'comment-replies');
    for (const reply of node.replies) replies.append(renderNode(reply, options));
    item.append(replies);
  }
  return item;
};

/** Render a comment thread (top-level nodes with nested replies). */
export const renderComments = (
  thread: CommentNode[],
  options: RenderCommentsOptions,
): HTMLElement => {
  const container = el('section', 'comments-thread');
  container.dataset['testid'] = 'comments-thread';
  for (const node of thread) container.append(renderNode(node, options));
  return container;
};
