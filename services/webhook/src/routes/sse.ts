import { Router, Request, Response } from 'express';

const router = Router();

interface SSEClient {
  id: string;
  response: Response;
  topics: Set<string>;
  lastEventId: string | null;
}

const clients = new Map<string, SSEClient>();
const eventBuffer: Array<{ topic: string; event: string; data: unknown }> = [];
const MAX_BUFFER_SIZE = 100;

function sendSSE(response: Response, event: string, data: unknown, eventId?: string): void {
  if (eventId) {
    response.write(`id: ${eventId}\n`);
  }
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastToTopic(topic: string, event: string, data: unknown): void {
  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  eventBuffer.push({ topic, event, data });
  if (eventBuffer.length > MAX_BUFFER_SIZE) {
    eventBuffer.shift();
  }

  for (const client of clients.values()) {
    if (client.topics.has(topic) || client.topics.has('*')) {
      try {
        sendSSE(client.response, event, data, eventId);
      } catch {
        clients.delete(client.id);
      }
    }
  }
}

router.get('/events', (req: Request, res: Response) => {
  const clientId = req.query.clientId as string || `sse-${crypto.randomUUID()}`;
  const topics = req.query.topics
    ? new Set((req.query.topics as string).split(','))
    : new Set<string>('*');
  const replayFrom = req.headers['last-event-id'] as string | undefined;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  sendSSE(res, 'connected', { clientId, topics: Array.from(topics), timestamp: new Date().toISOString() });

  if (replayFrom) {
    const replayTime = parseInt(replayFrom.split('-')[0]!, 10);
    const replayEvents = eventBuffer.filter(
      (e) => topics.has(e.topic) || topics.has('*'),
    );
    for (const entry of replayEvents) {
      sendSSE(res, entry.event, entry.data);
    }
  }

  const client: SSEClient = {
    id: clientId,
    response: res,
    topics,
    lastEventId: replayFrom || null,
  };

  clients.set(clientId, client);

  const keepAlive = setInterval(() => {
    try {
      sendSSE(res, 'keepalive', { timestamp: new Date().toISOString() });
    } catch {
      clearInterval(keepAlive);
      clients.delete(clientId);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(clientId);
  });
});

router.post('/emit', (req: Request, res: Response) => {
  const { topic, event, data } = req.body as {
    topic: string;
    event: string;
    data: unknown;
  };

  if (!topic || !event) {
    res.status(400).json({ success: false, error: 'topic and event are required' });
    return;
  }

  broadcastToTopic(topic, event, data || {});
  res.json({ success: true, message: `Event '${event}' emitted to topic '${topic}'` });
});

router.get('/clients', (_req: Request, res: Response) => {
  const clientList = Array.from(clients.values()).map((c) => ({
    id: c.id,
    topics: Array.from(c.topics),
    connected: true,
  }));

  res.json({
    success: true,
    data: {
      total: clients.size,
      clients: clientList,
    },
  });
});

export function emitEvent(topic: string, event: string, data: unknown): void {
  broadcastToTopic(topic, event, data);
}

export default router;
