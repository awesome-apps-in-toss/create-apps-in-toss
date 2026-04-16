import type { Response } from 'express';

export const sseClients = new Set<Response>();

export function broadcast(event: string, data: string) {
  const msg = `event: ${event}\ndata: ${data}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}
