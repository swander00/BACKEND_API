// ===============================================================================================
// TEST OPENAI API KEY CONFIGURATION
// ===============================================================================================
// Simple script to verify OpenAI API key is loaded and working
// ===============================================================================================

import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
const envLocalResult = dotenv.config({ path: './.env.local' });
if (envLocalResult.error && envLocalResult.error.code !== 'ENOENT') {
  console.log('⚠️  Warning: Could not load .env.local:', envLocalResult.error.message);
}
if (!process.env.PORT) {
  const envResult = dotenv.config({ path: './environment.env' });
  if (envResult.error && envResult.error.code !== 'ENOENT') {
    console.log('⚠️  Warning: Could not load environment.env:', envResult.error.message);
  }
}

console.log('\n🔍 Testing OpenAI API Key Configuration...\n');

// Check if API key exists
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.log('❌ ERROR: OPENAI_API_KEY not found in environment variables');
  console.log('\n📝 To fix this:');
  console.log('   1. Open API_BACK_END/.env.local');
  console.log('   2. Add your OpenAI API key:');
  console.log('      OPENAI_API_KEY=sk-your-actual-api-key-here');
  console.log('   3. Restart your server\n');
  process.exit(1);
}

if (apiKey === 'your-openai-api-key-here') {
  console.log('❌ ERROR: OPENAI_API_KEY is still set to placeholder value');
  console.log('\n📝 To fix this:');
  console.log('   1. Open API_BACK_END/.env.local');
  console.log('   2. Replace "your-openai-api-key-here" with your actual OpenAI API key');
  console.log('   3. Restart your server\n');
  process.exit(1);
}

// Mask the key for display
const maskedKey = apiKey.length > 10 
  ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
  : '***';

console.log(`✅ API Key found: ${maskedKey}`);
console.log(`   Length: ${apiKey.length} characters`);

// Test OpenAI API connection
console.log('\n🧪 Testing OpenAI API connection...\n');

try {
  const openai = new OpenAI({
    apiKey: apiKey
  });

  // Make a simple test call
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: 'Say "Hello, API test successful!" and nothing else.'
      }
    ],
    max_tokens: 20
  });

  const response = completion.choices[0]?.message?.content;
  
  if (response) {
    console.log('✅ OpenAI API connection successful!');
    console.log(`   Response: ${response}\n`);
    console.log('✅ Your OpenAI API key is configured correctly!');
    console.log('   AI summaries should now work when viewing property details.\n');
  } else {
    console.log('⚠️  Warning: OpenAI API returned empty response');
    console.log('   The API key might be invalid or have insufficient permissions.\n');
  }
} catch (error) {
  console.log('❌ ERROR: Failed to connect to OpenAI API');
  console.log(`   Error: ${error.message}\n`);
  
  if (error.status === 401) {
    console.log('📝 This usually means:');
    console.log('   - Your API key is invalid');
    console.log('   - Your API key has been revoked');
    console.log('   - Check your OpenAI account at https://platform.openai.com/api-keys\n');
  } else if (error.status === 429) {
    console.log('📝 This usually means:');
    console.log('   - You have exceeded your rate limit');
    console.log('   - Check your OpenAI account usage\n');
  } else {
    console.log('📝 Check:');
    console.log('   - Your internet connection');
    console.log('   - OpenAI API status: https://status.openai.com\n');
  }
  
  process.exit(1);
}

