import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { ENV } from '../src/config/env';

const key = process.env.GEMINI_EMBEDDING_API_KEY || ENV.GEMINI_EMBEDDING_API_KEY || process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY;
console.log('Using API key prefix:', key ? key.substring(0, 15) + '...' : 'undefined');

const ai = new GoogleGenAI({ apiKey: key });

async function testModel(modelName: string) {
  try {
    console.log(`Testing model: ${modelName}...`);
    const response = await ai.models.embedContent({
      model: modelName,
      contents: 'Hello world',
    });
    console.log(`✅ Success for ${modelName}! Vector length: ${response.embeddings?.[0]?.values?.length}`);
    return true;
  } catch (err: any) {
    console.log(`❌ Failed for ${modelName}: ${err.message}`);
    return false;
  }
}

async function main() {
  const models = [
    'text-embedding-004',
    'gemini-embedding-001',
    'text-multilingual-embedding-002',
    'models/text-embedding-004',
    'models/gemini-embedding-001'
  ];
  
  for (const model of models) {
    await testModel(model);
  }
}

main();
