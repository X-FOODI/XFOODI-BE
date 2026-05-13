import winston from 'winston';

/**
 * Creates and configures Winston logger
 */
export function createLogger(): winston.Logger {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    ),
    defaultMeta: { service: 'documentation-generator' },
    transports: [
      // Write all logs with level 'error' and below to error.log
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error' 
      }),
      // Write all logs to combined.log
      new winston.transports.File({ 
        filename: 'logs/combined.log' 
      })
    ]
  });

  // If not in production, log to console as well
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  return logger;
}
