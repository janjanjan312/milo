// Test script to check and inject AI advice into localStorage
const sampleAdvice = `信息收集完毕啦！根据你的饮食、作息和压力情况,我梳理了以下几点优化建议:

1. 起床后尽快补充蛋白质(如鸡蛋或豆浆),避免血糖过低导致下午想吃甜腻食物。
2. 下午饿了或压力大时,先喝一杯水确认是口渴还是嘴馋,尽量把牛奶茶换成无糖茶饮或少量水果。
3. 建议尽量在午夜12点后不再进食,减轻肠胃负担也能减少夜间不必要的热量。
4. 晚间的饼干薯片换成原味坚果、低糖酸奶或黄瓜,既能解馋又不容易发胖。
5. 赶作业时若感到焦虑想吃的冲动,站起来伸展一下身体,换个环境走走神。

你要不要我根据这些建议帮你设计一份具体的一日食谱?`;

console.log('=== Testing AI Advice Card ===\n');

// Check current localStorage
const currentAdvice = localStorage.getItem('savedAdvice');
console.log('Current savedAdvice in localStorage:', currentAdvice ? 'EXISTS' : 'NOT FOUND');

if (currentAdvice) {
  try {
    const parsed = JSON.parse(currentAdvice);
    console.log('Current advice content:', parsed.substring(0, 100) + '...\n');
  } catch (e) {
    console.log('Current advice (raw):', currentAdvice.substring(0, 100) + '...\n');
  }
}

// Check chat messages for numbered advice
const chatMessages = localStorage.getItem('chatMessages');
if (chatMessages) {
  try {
    const messages = JSON.parse(chatMessages);
    console.log(`\nFound ${messages.length} chat messages`);
    
    // Look for messages from model with numbered lists
    const adviceMessages = messages.filter(msg => {
      if (msg.role !== 'model') return false;
      const text = msg.text || '';
      // Check for numbered patterns like "1. " or "1、"
      return /[1-9][\.\)、]/.test(text) && (text.includes('建议') || text.includes('优化') || text.includes('调整'));
    });
    
    if (adviceMessages.length > 0) {
      console.log(`\nFound ${adviceMessages.length} potential advice message(s):`);
      adviceMessages.forEach((msg, idx) => {
        console.log(`\n--- Advice Message ${idx + 1} ---`);
        console.log(msg.text.substring(0, 200) + '...');
      });
    } else {
      console.log('\nNo numbered advice found in chat messages.');
    }
  } catch (e) {
    console.error('Error parsing chat messages:', e);
  }
}

// Inject sample advice if not present
if (!currentAdvice) {
  console.log('\n=== Injecting sample advice ===');
  localStorage.setItem('savedAdvice', JSON.stringify(sampleAdvice));
  console.log('Sample advice injected successfully!');
} else {
  console.log('\n=== Advice already exists, not injecting ===');
}

console.log('\n=== Test Complete ===');
console.log('You can now navigate to the Profile page to see the AI advice card.');
