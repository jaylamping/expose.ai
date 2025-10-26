/**
 * Test with a simplified HuggingFace client
 */

import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config();

class SimpleHuggingFaceClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api-inference.huggingface.co';
  }

  async classifyText(text, model) {
    const url = `${this.baseUrl}/models/${model}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          options: {
            wait_for_model: true,
            use_cache: true,
          },
        }),
        timeout: 60000,
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      } else {
        const errorText = await response.text();
        return { success: false, error: `${response.status}: ${errorText}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

async function testSimpleClient() {
  console.log('🧪 Testing with simplified HuggingFace client...');

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const client = new SimpleHuggingFaceClient(apiKey);
  const testText = 'Hello, this is a test message.';
  const model = 'Hello-SimpleAI/chatgpt-detector-roberta';

  try {
    console.log(`📝 Testing with text: "${testText}"`);
    console.log(`🤖 Using model: ${model}`);

    const result = await client.classifyText(testText, model);

    if (result.success) {
      console.log(
        '✅ Success! Response:',
        JSON.stringify(result.data, null, 2)
      );

      // Process the response
      if (
        Array.isArray(result.data) &&
        result.data.length > 0 &&
        Array.isArray(result.data[0])
      ) {
        const results = result.data[0];
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

        console.log('🎉 SUCCESS! The simplified client works!');
      }
    } else {
      console.log('❌ Failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSimpleClient();
