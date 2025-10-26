/**
 * Direct test of Hugging Face API to debug the issue
 */

import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config({ path: '../.env' });

async function testHuggingFaceAPI() {
  console.log('🧪 Testing Hugging Face API directly...');
  console.log(
    '🔑 API Key loaded:',
    process.env.HUGGINGFACE_API_KEY ? '✅ Yes' : '❌ No'
  );

  if (!process.env.HUGGINGFACE_API_KEY) {
    console.error('❌ No API key found!');
    return;
  }

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const testText = 'Hello, this is a test message.';

  // Test with a simple, reliable model first
  const models = [
    'gpt2', // Simple generation model
    'distilbert-base-uncased', // Simple classification model
    'Hello-SimpleAI/chatgpt-detector-roberta', // The AI detector model
  ];

  for (const model of models) {
    console.log(`\n🔍 Testing model: ${model}`);

    try {
      // Test classification endpoint
      console.log('  📝 Testing classification...');
      const classificationUrl = `https://api-inference.huggingface.co/models/${model}`;

      const response = await fetch(classificationUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: testText,
          options: {
            wait_for_model: true,
            use_cache: true,
          },
        }),
        timeout: 10000, // 10 second timeout
      });

      console.log(
        `  📊 Response status: ${response.status} ${response.statusText}`
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Success! Response:`, JSON.stringify(data, null, 2));
        break; // If one model works, we're good
      } else {
        const errorText = await response.text();
        console.log(`  ❌ Error response:`, errorText);
      }
    } catch (error) {
      console.log(`  ❌ Request failed:`, error.message);
    }
  }
}

// Run the test
testHuggingFaceAPI();
