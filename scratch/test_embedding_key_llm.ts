import { GoogleGenAI } from '@google/genai';

// Use the embedding key to call generateContent
const embeddingKey = "AIzaSyDrJ99NpM0l7zilbuOjXmvxqwp2TZLPIvg";
const ai = new GoogleGenAI({ apiKey: embeddingKey });

async function main() {
  try {
    console.log('Testing generateContent with the embedding API key...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello, are you active?',
    });
    console.log('✅ Success! Response:', response.text);
  } catch (err: any) {
    console.log('❌ Failed:', err.message);
  }
}

main();
