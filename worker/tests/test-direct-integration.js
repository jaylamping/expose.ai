/**
 * Test direct integration with the working model
 */

import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config({ path: '.env' });

async function testDirectIntegration() {
  console.log('🧪 Testing direct integration with working model...');

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const testText = 'Hello, this is a test message.';
  const model = 'Hello-SimpleAI/chatgpt-detector-roberta';

  try {
    console.log(`📝 Testing with text: "${testText}"`);
    console.log(`🤖 Using model: ${model}`);

    const url = `https://api-inference.huggingface.co/models/${model}`;

    const response = await fetch(url, {
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
      timeout: 60000, // 60 second timeout
    });

    console.log(
      `📊 Response status: ${response.status} ${response.statusText}`
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Success! Raw response:`, JSON.stringify(data, null, 2));

      // Process the response like our AI Detector would
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
        const results = data[0];
        const aiLabel = results.find(
          (item) =>
            item.label.toLowerCase().includes('chatgpt') ||
            item.label.toLowerCase().includes('ai') ||
            item.label.toLowerCase().includes('generated')
        );
        const humanLabel = results.find(
          (item) =>
            item.label.toLowerCase().includes('human') ||
            item.label.toLowerCase().includes('real')
        );

        const aiScore = aiLabel?.score ?? 0;
        const humanScore = humanLabel?.score ?? 0;
        const normalizedScore = aiScore > humanScore ? aiScore : 1 - humanScore;
        const confidence = Math.abs(normalizedScore - 0.5) * 2;
        const label = normalizedScore > 0.5 ? 'AI' : 'Human';

        console.log('🎯 Processed Result:', {
          score: normalizedScore.toFixed(3),
          confidence: confidence.toFixed(3),
          label: label,
          rawScore: aiScore.toFixed(3),
        });

        console.log('🎉 SUCCESS! The model is working perfectly!');
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Error response:`, errorText);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testDirectIntegration();
