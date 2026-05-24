import winston from 'winston';
import { format } from 'logform';
import DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, label, printf, errors, json } = format;

const logFormat = printf(({ level, message, label, timestamp, stack }) => {
  return `${timestamp} [${label}] ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    label({ label: 'aggregation-service' }),
    timestamp(),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { service: 'aggregation-service' },
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        printf(({ level, message, label, timestamp }) => {
          return `${timestamp} [${label}] ${level}: ${message}`;
        })
      )
    }),
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

export { logger };