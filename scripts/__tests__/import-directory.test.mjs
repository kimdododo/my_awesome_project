import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { callClaudeBatch, callWithRetry, normalizeWithClaude, parseArgs } from '../import-directory.mjs';

function mkAnthropicResponse(text, usage = {}) {
  return {
    content: [{ type: 'text', text }],
    usage,
  };
}

describe('parseArgs', () => {
  it('defaults to all sources when none provided', () => {
    const args = parseArgs(['node', 'scripts/import-directory.mjs']);
    expect(args.debug).toBe(false);
    expect(args.sources).toEqual(['oliveyoung', 'intercharm']);
  });

  it('supports --debug and explicit sources', () => {
    const args = parseArgs(['node', 'x', '--debug', 'oliveyoung']);
    expect(args.debug).toBe(true);
    expect(args.sources).toEqual(['oliveyoung']);
  });

  it('supports "all" keyword', () => {
    const args = parseArgs(['node', 'x', 'all']);
    expect(args.sources).toEqual(['oliveyoung', 'intercharm']);
  });

  it('ignores unknown args', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const args = parseArgs(['node', 'x', 'unknown-arg', 'oliveyoung']);
    expect(args.sources).toEqual(['oliveyoung']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('callWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(callWithRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and eventually succeeds', async () => {
    const err = Object.assign(new Error('boom'), { status: 500, headers: {} });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');

    const p = callWithRetry(fn, { tries: 3, baseMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses retry-after when provided', async () => {
    const err = Object.assign(new Error('rate'), { status: 429, headers: { 'retry-after': '2' } });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');

    const p = callWithRetry(fn, { tries: 3, baseMs: 1000 });
    // should wait 2s, not 1s
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable errors', async () => {
    const err = Object.assign(new Error('bad request'), { status: 400, headers: {} });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(callWithRetry(fn, { tries: 5, baseMs: 1 })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('callClaudeBatch', () => {
  it('parses JSON array when model returns raw array', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(
          mkAnthropicResponse('[{"b":"Brand","p":"A","c":["Korea"],"pl":"X","s":0,"e":""}]', {
            input_tokens: 1,
            output_tokens: 2,
          })
        ),
      },
    };

    const r = await callClaudeBatch(client, {
      sourceName: 'oliveyoung',
      candidates: [{ name: 'Brand' }],
      defaults: { p: 'A', c: ['Korea'], pl: 'X' },
      existingNames: ['Existing'],
    });
    expect(r.brands).toHaveLength(1);
    expect(r.brands[0].b).toBe('Brand');
    expect(r.usage.output_tokens).toBe(2);
  });

  it('parses JSON array inside code fences', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(mkAnthropicResponse('```json\n[{"b":"A"}]\n```')),
      },
    };

    const r = await callClaudeBatch(client, {
      sourceName: 'oliveyoung',
      candidates: [{ name: 'A' }],
      defaults: { p: 'A', c: [], pl: 'X' },
      existingNames: [],
    });
    expect(r.brands).toEqual([{ b: 'A' }]);
  });

  it('extracts first JSON array when surrounded by extra text', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(mkAnthropicResponse('Here you go:\n[{"b":"A"}]\nThanks')),
      },
    };

    const r = await callClaudeBatch(client, {
      sourceName: 'oliveyoung',
      candidates: [{ name: 'A' }],
      defaults: { p: 'A', c: [], pl: 'X' },
      existingNames: [],
    });
    expect(r.brands).toEqual([{ b: 'A' }]);
  });

  it('throws when response is not a JSON array', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(mkAnthropicResponse('{"b":"not array"}')),
      },
    };

    await expect(
      callClaudeBatch(client, {
        sourceName: 'oliveyoung',
        candidates: [{ name: 'A' }],
        defaults: { p: 'A', c: [], pl: 'X' },
        existingNames: [],
      })
    ).rejects.toBeTruthy();
  });
});

describe('normalizeWithClaude', () => {
  it('splits into batches of 200 and aggregates usage', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(mkAnthropicResponse('[{"b":"A"}]', { input_tokens: 10, output_tokens: 1 }))
      .mockResolvedValueOnce(mkAnthropicResponse('[{"b":"B"}]', { input_tokens: 20, output_tokens: 2 }));

    const client = { messages: { create } };
    const candidates = Array.from({ length: 201 }, (_, i) => ({ name: `Brand${i}` }));

    const r = await normalizeWithClaude(client, {
      sourceName: 'x',
      candidates,
      defaults: { p: 'A', c: [], pl: 'X' },
      existingNames: [],
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(r.brands.map((b) => b.b)).toEqual(['A', 'B']);
    expect(r.usage.input_tokens).toBe(30);
    expect(r.usage.output_tokens).toBe(3);
  });
});

