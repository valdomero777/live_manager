import { describe, expect, it } from 'vitest';
import { ActionQueue } from './action-queue.js';

type Item = { name: string; priority: number };
const item = (name: string, priority: number): Item => ({ name, priority });
const drain = (q: ActionQueue<Item>) => {
  const out: string[] = [];
  for (let next = q.dequeue(); next; next = q.dequeue()) out.push(next.name);
  return out;
};

describe('ActionQueue', () => {
  it('orders by priority descending, then arrival', () => {
    const q = new ActionQueue<Item>(10);
    q.enqueue(item('a', 0));
    q.enqueue(item('b', 50));
    q.enqueue(item('c', 0));
    q.enqueue(item('d', 50));
    expect(drain(q)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('when full, evicts the lowest priority and oldest item', () => {
    const q = new ActionQueue<Item>(3);
    q.enqueue(item('low-old', 1));
    q.enqueue(item('low-new', 1));
    q.enqueue(item('high', 9));
    const result = q.enqueue(item('mid', 5));
    expect(result).toEqual({ accepted: true, evicted: item('low-old', 1) });
    expect(drain(q)).toEqual(['high', 'mid', 'low-new']);
  });

  it('when full, rejects an item that is not higher than the lowest', () => {
    const q = new ActionQueue<Item>(2);
    q.enqueue(item('a', 5));
    q.enqueue(item('b', 5));
    expect(q.enqueue(item('c', 5))).toEqual({ accepted: false });
    expect(q.size).toBe(2);
  });

  it('requeueFront puts an item ahead of its priority band', () => {
    const q = new ActionQueue<Item>(10);
    q.enqueue(item('a', 1));
    q.enqueue(item('high', 9));
    q.requeueFront(item('retry', 1));
    expect(drain(q)).toEqual(['high', 'retry', 'a']);
  });

  it('clear returns and removes everything', () => {
    const q = new ActionQueue<Item>(10);
    q.enqueue(item('a', 1));
    expect(q.clear()).toHaveLength(1);
    expect(q.size).toBe(0);
  });
});
