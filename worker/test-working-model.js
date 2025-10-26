/**
 * Test using only the working model
 */

import { config } from 'dotenv';
import { createAIDetector } from './dist/ml/ai-detector.js';

// Load environment variables
config();

async function testWorkingModel() {
  console.log('🧪 Testing with only the working model...');

  try {
    // Create AI Detector with only the working model
    const aiDetector = createAIDetector({
      model: 'Hello-SimpleAI/chatgpt-detector-roberta',
    });

    console.log('✅ AI Detector created with working model');
    console.log('📋 Available models:', aiDetector.getAvailableModels());

    const testText = 'Hello, this is a test message.';
    console.log(`📝 Testing with text: "${testText}"`);

    const result = await aiDetector.detectText(testText);

    console.log('🎯 AI Detection Result:', {
      score: result.score.toFixed(3),
      confidence: result.confidence.toFixed(3),
      label: result.label,
      rawScore: result.rawScore.toFixed(3),
    });

    if (result.score > 0) {
      console.log('🎉 SUCCESS! The AI Detector is working!');
    } else {
      console.log('⚠️ Still getting default values, but no errors');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testWorkingModel();
