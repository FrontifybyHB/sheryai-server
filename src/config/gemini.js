import { getNvidiaClient, getNvidiaModel } from './nvidia.js';

class GeminiCompatibleAiClient {
  toMessages(promptOrObject) {
    if (typeof promptOrObject === 'string') {
      return [{ role: 'user', content: promptOrObject }];
    }

    const messages = [];
    if (promptOrObject?.systemInstruction) {
      messages.push({ role: 'system', content: promptOrObject.systemInstruction });
    }

    for (const item of promptOrObject?.contents || []) {
      messages.push({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts?.map((part) => part.text).join('') || '',
      });
    }

    return messages;
  }

  async generateContent(promptOrObject) {
    const completion = await getNvidiaClient().chat.completions.create({
      model: getNvidiaModel(),
      messages: this.toMessages(promptOrObject),
      temperature: promptOrObject?.generationConfig?.temperature ?? 0.3,
      max_tokens: promptOrObject?.generationConfig?.maxOutputTokens ?? 4096,
    });

    const text = completion.choices[0]?.message?.content || '';
    return { response: { text: () => text } };
  }

  async generateContentStream(opts) {
    const messages = [];
    if (opts.systemInstruction) messages.push({ role: 'system', content: opts.systemInstruction });

    for (const item of opts.contents || []) {
      messages.push({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts?.map((part) => part.text).join('') || '',
      });
    }

    const stream = await getNvidiaClient().chat.completions.create({
      model: getNvidiaModel(),
      messages,
      temperature: opts.generationConfig?.temperature ?? 0.35,
      max_tokens: opts.generationConfig?.maxOutputTokens ?? 1500,
      stream: true,
    });

    return {
      stream: (async function* streamChunks() {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) yield { text: () => text };
        }
      })(),
    };
  }
}

export const geminiFlash = new GeminiCompatibleAiClient();
export default geminiFlash;
