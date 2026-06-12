import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

export const ENV = {
  PORT: process.env.PORT || 5000,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  API_URL: process.env.API_URL || 'http://localhost:5000/api',
  DATABASE_URL: process.env.DATABASE_URL as string,
  DIRECT_URL: process.env.DIRECT_URL as string,
  REDIS_URL: process.env.REDIS_URL as string,
  
  SENDGRID: {
    API_KEY: process.env.SENDGRID_API_KEY as string,
    EMAIL_FROM: process.env.EMAIL_FROM as string,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO as string,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME as string,
  },
  
  JWT: {
    ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
    REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
  },

  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID as string | undefined,
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET as string | undefined,
  },

  TURNSTILE: {
    SECRET_KEY: process.env.TURNSTILE_SECRET_KEY as string | undefined,
  },

  CLOUDINARY: {
    CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
    API_KEY: process.env.CLOUDINARY_API_KEY as string,
    API_SECRET: process.env.CLOUDINARY_API_SECRET as string,
  },

  TWILIO: {
    ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID as string,
    AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN as string,
    PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER as string,
  },

  DOCUMENT_ENCRYPTION_KEY: process.env.DOCUMENT_ENCRYPTION_KEY as string,

  GEMINI_API_KEY: process.env.GEMINI_API_KEY as string,
  GEMINI_EMBEDDING_API_KEY: process.env.GEMINI_EMBEDDING_API_KEY as string,
  COHERE_API_KEY: process.env.COHERE_API_KEY as string,

  AI: {
    DEFAULT_MODEL: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash',
    EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    DEFAULT_TEMPERATURE: process.env.GEMINI_DEFAULT_TEMPERATURE ? parseFloat(process.env.GEMINI_DEFAULT_TEMPERATURE) : 0.4,
    RAG_MAX_CHUNKS: process.env.RAG_MAX_CHUNKS ? parseInt(process.env.RAG_MAX_CHUNKS, 10) : 8,
    RAG_HISTORY_SUMMARIZATION_THRESHOLD: process.env.RAG_HISTORY_SUMMARIZATION_THRESHOLD ? parseInt(process.env.RAG_HISTORY_SUMMARIZATION_THRESHOLD, 10) : 10,
  },

  SUPABASE: {
    URL: process.env.SUPABASE_URL || 'https://turgkdnvkagomsdbwkah.supabase.co',
    KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    BUCKET: process.env.SUPABASE_BUCKET || 'knowledge-base',
  },
};

// Validate required environment variables
const validateEnv = () => {
  const required = [
    'DATABASE_URL', 
    'JWT_ACCESS_SECRET', 
    'JWT_REFRESH_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn(`⚠️ Warning: Missing required environment variables: ${missing.join(', ')}`);
  }
};

validateEnv();
