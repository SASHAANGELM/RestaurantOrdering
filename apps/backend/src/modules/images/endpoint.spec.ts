import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeDatabase } from '../../db/initialize';
import type { DatabaseConnection } from '../../db/connection';

describe('confined backend image delivery', () => {
  let directory: string; let connection: DatabaseConnection; let server: Server; let url: string;
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9]);
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'restaurant-images-'));
    const images = join(directory, 'images'); mkdirSync(images); mkdirSync(join(images, 'folder.jpg'));
    writeFileSync(join(images, 'soup.jpg'), bytes); writeFileSync(join(directory, 'secret.jpg'), 'private outside file');
    writeFileSync(join(images, '.env'), 'private config'); writeFileSync(join(images, 'notes.txt'), 'private notes');
    symlinkSync(join(directory, 'secret.jpg'), join(images, 'leak.jpg'));
    connection = initializeDatabase({ filename: join(directory, 'test.sqlite') });
    server = createServer(createApp({ connection, imagesDirectory: images, jsonBodyLimitBytes: 65536 }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing listener');
    url = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); connection.close(); rmSync(directory, { recursive: true, force: true }); });
  it('serves only the configured file with image headers and HEAD support', async () => {
    const response = await fetch(`${url}/api/images/soup.jpg`);
    expect(response.status).toBe(200); expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('content-type')).toContain('image/jpeg');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    const head = await fetch(`${url}/api/images/soup.jpg`, { method: 'HEAD' });
    expect(head.status).toBe(200); expect(await head.text()).toBe('');
  });
  it.each(['../secret.jpg', '%2e%2e%2fsecret.jpg', '..%5csecret.jpg', '%252e%252e%252fsecret.jpg', '%2fetc%2fpasswd', '.env', 'notes.txt', 'folder.jpg', 'leak.jpg', 'missing.jpg', 'soup.jpg%00.txt', 'soup.jpg/../leak.jpg'])('does not leak files for %s', async (name) => {
    const response = await fetch(`${url}/api/images/${name}`); expect(response.status).toBe(404);
    const body = await response.text(); expect(body).not.toMatch(/private|restaurant-images-|\/etc\/|SQL/);
  });
});
