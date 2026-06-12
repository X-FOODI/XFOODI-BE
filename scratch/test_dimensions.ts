import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { ENV } from '../src/config/env';

const key = process.env.GEMINI_EMBEDDING_API_KEY || ENV.GEMINI_EMBEDDING_API_KEY || process.env.GEMINI_API_KEY || ENV.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: key });

async function main() {
  try {
    console.log('Testing gemini-embedding-001 with outputDimensionality: 768 inside config...');
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: 'Hello world',
      config: {
        outputDimensionality: 768
      }
    });
    console.log(`✅ Success! Vector length: ${response.embeddings?.[0]?.values?.length}`);
  } catch (err: any) {
    console.log(`❌ Failed with config: ${err.message}`);
    
    // Try without config (directly in the root options)
    try {
      console.log('Testing gemini-embedding-001 with outputDimensionality at root...');
      const response = await (ai.models as any).embedContent({
        model: 'gemini-embedding-001',
        contents: 'Hello world',
        outputDimensionality: 768
      });
      console.log(`✅ Success at root! Vector length: ${response.embeddings?.[0]?.values?.length}`);
    } catch (err2: any) {
      console.log(`❌ Failed at root: ${err2.message}`);
    }
  }
}

main();
