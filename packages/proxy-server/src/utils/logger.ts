import winston from 'winston';

/**
 * Creates a configured logger instance
 */
export const createLogger = (service?: string) => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  
  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, service: svc, ...meta }) => {
        const serviceLabel = svc || service || 'proxy';
        return JSON.stringify({
          timestamp,
          level,
          service: serviceLabel,
          message,
          ...meta
        });
      })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ]
  });

  // Add service context if provided
  if (service) {
    return logger.child({ service });
  }

  return logger;
}; 