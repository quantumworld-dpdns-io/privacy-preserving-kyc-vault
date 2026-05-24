import type { HealthCheckResult } from '../health_checks.js';

export interface KafkaHealthConfig {
  listTopics: () => Promise<string[]>;
  producer?: { send: (topic: string, message: string) => Promise<void> };
  expectedTopics?: string[];
  name?: string;
  timeout?: number;
}

export function createKafkaHealthCheck(config: KafkaHealthConfig) {
  const name = config.name ?? 'kafka';
  return {
    name,
    timeout: config.timeout ?? 15000,
    async check(): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const topics = await config.listTopics();
        const issues: string[] = [];

        if (config.expectedTopics) {
          for (const expected of config.expectedTopics) {
            if (!topics.includes(expected)) {
              issues.push(`Missing topic: ${expected}`);
            }
          }
        }

        if (config.producer) {
          try {
            await config.producer.send('health-check', 'ping');
          } catch {
            issues.push('Producer send failed');
          }
        }

        const status = issues.length === 0 ? 'healthy' : 'degraded';
        return {
          name,
          status,
          message: status === 'healthy'
            ? `Kafka responsive with ${topics.length} topics`
            : issues.join('; '),
          duration: Date.now() - start,
          timestamp: start,
          metadata: { topics, topicCount: topics.length },
        };
      } catch (err) {
        return {
          name,
          status: 'unhealthy',
          message: (err as Error).message,
          duration: Date.now() - start,
          timestamp: start,
        };
      }
    },
  };
}
