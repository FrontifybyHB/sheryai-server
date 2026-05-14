import { secondsToLabel } from '../utils/timeFormatter.js';
import AppError from '../utils/AppError.js';
import logger from '../loggers/logger.js';
import { buildSystemInstruction } from '../lib/prompt/ai-video.js';

class ChatService {
  constructor({ lessonRepository, chunkCacheService, chatSessionRepository, aiClient }) {
    this.lessonRepository = lessonRepository;
    this.chunkCacheService = chunkCacheService;
    this.chatSessionRepository = chatSessionRepository;
    this.aiClient = aiClient;
  }

  stopwords() {
    return new Set(['a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'for', 'with', 'this', 'that', 'was', 'are', 'be', 'as', 'by', 'from']);
  }

  // Detects if the user wants a full video summary/notes instead of a specific Q&A
  isSummaryRequest(message) {
    return /\b(summarize|summarise|summary|notes|key points?|key takeaway|overview|explain the (whole|entire|full)|what (is|was) this video|what did (he|she|they) (say|explain|cover)|recap|tldr|tl;?dr)\b/i.test(message);
  }

  // For summary requests: evenly sample chunks across the WHOLE video
  // For normal Q&A: use BM25 keyword search
  selectChatChunks(message, chunks, currentTime) {
    if (this.isSummaryRequest(message)) {
      const maxSample = 25;
      const step = Math.max(1, Math.floor(chunks.length / maxSample));
      return chunks.filter((_, i) => i % step === 0).slice(0, maxSample);
    }
    // Normal Q&A — BM25 semantic search + temporal context
    const semanticChunks = this.bm25Search(message, chunks, 12);
    const temporalChunks = this.findTemporalChunks(chunks, currentTime, 3);
    return this.buildContextBlocks(semanticChunks, temporalChunks);
  }

  bm25Search(query, chunks, k = 7) {
    const tokens = query
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 2 && !this.stopwords().has(token));

    if (!tokens.length) return chunks.slice(0, k);

    const avgLen = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length;
    const k1 = 1.5;
    const b = 0.75;
    const df = {};

    tokens.forEach((token) => {
      df[token] = chunks.filter((chunk) => chunk.text.toLowerCase().includes(token)).length;
    });

    return chunks
      .map((chunk) => {
        const text = chunk.text.toLowerCase();
        const words = text.split(/\W+/);
        const tf = {};
        words.forEach((word) => { tf[word] = (tf[word] || 0) + 1; });

        const score = tokens.reduce((sum, token) => {
          const termFreq = tf[token] || 0;
          if (!termFreq) return sum;

          const idf = Math.log((chunks.length - df[token] + 0.5) / (df[token] + 0.5) + 1);
          const norm = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + (b * text.length) / avgLen));
          return sum + idf * norm;
        }, 0);

        return { ...chunk, _score: score };
      })
      .sort((a, bScore) => bScore._score - a._score)
      .slice(0, k);
  }

  findTemporalChunks(chunks, currentTime, count = 2) {
    if (!currentTime || currentTime <= 0) return [];

    return chunks
      .filter((chunk) => Math.abs(chunk.startTime - currentTime) < 90)
      .sort((a, b) => Math.abs(a.startTime - currentTime) - Math.abs(b.startTime - currentTime))
      .slice(0, count);
  }

  buildContextBlocks(semanticChunks, temporalChunks) {
    const seen = new Set();
    return [...semanticChunks, ...temporalChunks]
      .filter((chunk) => {
        if (seen.has(chunk.chunkIndex)) return false;
        seen.add(chunk.chunkIndex);
        return true;
      })
      .sort((a, b) => a.startTime - b.startTime)
      .map((chunk) => `[${chunk.startLabel} - ${chunk.endLabel}]\n${chunk.text}`)
      .join('\n\n');
  }

  // ─── Prompt: edit src/lib/prompt/ai-video.js to change the system instruction ───
  systemInstruction(currentTime) {
    return buildSystemInstruction(currentTime, secondsToLabel);
  }

  formatHistory(messages) {
    return messages.slice(-6).map((message) => ({
      role: message.role === 'user' ? 'user' : 'model',
      parts: [{ text: message.content }],
    }));
  }

  async getSessionHistory(studentId, lessonId, sessionId) {
    const session = await this.chatSessionRepository.findBySession(studentId, lessonId, sessionId);
    return session?.messages || [];
  }

  async ensureLessonReady(lessonId) {
    const lesson = await this.lessonRepository.findById(lessonId);
    if (!lesson) throw new AppError('Lesson not found.', 404);
    return lesson;
  }

  async *streamChat({ lessonId, message, currentTime = 0, history = [] }) {
    const lesson = await this.ensureLessonReady(lessonId);

    if (lesson.status !== 'ready') {
      yield { type: 'error', message: `Video is still ${lesson.status}. Chatbot will be available once processing completes.` };
      return;
    }

    const chunks = await this.chunkCacheService.getChunks(lessonId);
    if (!chunks.length) {
      yield { type: 'error', message: 'No transcript data found. The video may still be processing.' };
      return;
    }

    let contextBlocks;
    if (this.isSummaryRequest(message)) {
      // Even-sample the whole video for summary requests
      const maxSample = 25;
      const step = Math.max(1, Math.floor(chunks.length / maxSample));
      const sampledChunks = chunks.filter((_, i) => i % step === 0).slice(0, maxSample);
      contextBlocks = sampledChunks
        .map((chunk) => `[${chunk.startLabel} - ${chunk.endLabel}]\n${chunk.text}`)
        .join('\n\n');
    } else {
      const semanticChunks = this.bm25Search(message, chunks, 12);
      const temporalChunks = this.findTemporalChunks(chunks, currentTime, 3);
      contextBlocks = this.buildContextBlocks(semanticChunks, temporalChunks);
    }

    if (!contextBlocks.trim()) {
      yield { type: 'error', message: 'Could not find relevant content in the transcript.' };
      return;
    }

    const videoTitle = lesson.title ? `VIDEO TITLE: ${lesson.title}\n` : '';
    const userMessage = `${videoTitle}TRANSCRIPT CONTEXT (most relevant sections):\n\n${contextBlocks}\n\n---\nSTUDENT QUESTION: ${message}`;

    const streamResult = await this.aiClient.generateContentStream({
      systemInstruction: this.systemInstruction(currentTime),
      contents: [
        ...this.formatHistory(history),
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: { temperature: 0.35, maxOutputTokens: 1500 },
    });

    let fullResponse = '';
    for await (const chunk of streamResult.stream) {
      const text = chunk.text();
      if (!text) continue;
      fullResponse += text;
      yield { type: 'token', content: text };
    }

    const followUps = await this.generateFollowUpQuestions(fullResponse);
    yield { type: 'followUps', items: followUps };
    yield { type: 'done', fullResponse, followUps };
  }

  async generateFollowUpQuestions(aiAnswer) {
    const fallback = [
      'Can you give me an example of this?',
      'Summarize this section for me',
      'What comes after this topic?',
    ];

    try {
      const prompt = `Based on this AI tutor answer about a lecture:
"${aiAnswer.substring(0, 1200)}"

Suggest 3 natural follow-up questions a student might ask next.
Make them short, specific, directly related to what was just explained, and in English only.
Return ONLY a valid JSON array of 3 strings. No markdown, no explanation.`;

      const result = await this.aiClient.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 200 },
      });

      const jsonMatch = result.response.text().trim().match(/\[[\s\S]*\]/);
      if (!jsonMatch) return fallback;

      const questions = JSON.parse(jsonMatch[0]);
      return Array.isArray(questions) ? questions.slice(0, 3) : fallback;
    } catch {
      return fallback;
    }
  }

  async saveSessionMessage(sessionId, lessonId, studentId, userMessage, aiMessage, followUps) {
    try {
      await this.chatSessionRepository.appendMessages(
        sessionId,
        lessonId,
        studentId,
        { user: userMessage, assistant: aiMessage },
        followUps,
      );
    } catch (err) {
      logger.warn(`Failed to save chat session: ${err.message}`);
    }
  }

  async generateSummary(lessonId, type = 'full', startTime = 0, endTime = 0) {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    if (!chunks.length) throw new AppError('No transcript chunks found', 404);

    const selectedChunks = this.selectSummaryChunks(chunks, type, startTime, endTime);
    if (!selectedChunks.length) throw new AppError('No transcript content found for this range.', 404);

    const context = selectedChunks.map((chunk) => `[${chunk.startLabel}] ${chunk.text}`).join('\n\n');
    const scopeInstruction = {
      full: 'Provide a complete, comprehensive summary covering every major topic, concept, and example from the lecture.',
      last5min: 'Focus exclusively on the final section: concluding arguments, key takeaways, and any calls to action.',
      range: 'Summarise only the content within the given timestamp range - nothing outside it.',
    }[type] || 'Summarise the main content.';

    const prompt = `You are an elite educational content curator. Write the entire summary in English only.

${scopeInstruction}

Required format:
### TL;DR
One powerful sentence.

### Core Concepts
- Concept Name — clear explanation

### Key Points
- 5-8 important points

### Examples & Definitions
Mention examples, definitions, or code from the lecturer.

### Quick-Recall Flashcards
3-5 Q&A pairs.

TRANSCRIPT:
${context}`;

    const result = await this.aiClient.generateContent(prompt);
    return result.response.text();
  }

  selectSummaryChunks(chunks, type, startTime, endTime) {
    const totalDuration = chunks[chunks.length - 1]?.endTime || 0;

    if (type === 'full') {
      const first20 = chunks.slice(0, 20);
      const last20 = chunks.slice(-20);
      const seen = new Set(first20.map((chunk) => chunk.chunkIndex));
      return [...first20, ...last20.filter((chunk) => !seen.has(chunk.chunkIndex))];
    }

    if (type === 'last5min') {
      const cutoff = Math.max(0, totalDuration - 300);
      return chunks.filter((chunk) => chunk.startTime >= cutoff);
    }

    if (type === 'range') {
      return chunks.filter((chunk) => chunk.startTime >= startTime && chunk.endTime <= endTime);
    }

    return chunks.slice(0, 30);
  }

  buildQuizPrompt(batchCount, difficulty, context) {
    const difficultyNote = difficulty === 'mixed'
      ? 'Vary the difficulty: recall, application, and deeper analysis.'
      : difficulty === 'easy'
        ? 'All questions must be foundational.'
        : difficulty === 'hard'
          ? 'All questions must require advanced analysis or synthesis.'
          : 'All questions must test understanding and application.';

    return `Generate exactly ${batchCount} MCQ questions from the transcript.

${difficultyNote}

Rules:
1. Base questions ONLY on the transcript. Each tests a different concept.
2. answer = single letter only: A, B, C, or D.
3. explanation = 1-2 sentences.
4. startLabel = timestamp like "1:23".
5. difficulty = easy | medium | hard.
6. topic = 2-4 word label.

Return ONLY raw JSON array.

TRANSCRIPT:
${context}`;
  }

  parseQuizResponse(raw) {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((question) => question.question && Array.isArray(question.options) && question.options.length >= 2 && question.answer)
        .map((question) => ({
          question: question.question,
          options: question.options.slice(0, 4),
          answer: String(question.answer).trim().charAt(0).toUpperCase(),
          explanation: question.explanation || '',
          startLabel: question.startLabel || '',
          difficulty: question.difficulty || 'medium',
          topic: question.topic || '',
        }));
    } catch {
      return [];
    }
  }

  async generateQuiz(lessonId, count = 10, _type = 'mcq', difficulty = 'mixed') {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    if (!chunks.length) throw new AppError('No transcript data found for this lesson.', 404);

    const maxChunks = 20;
    const step = Math.max(1, Math.floor(chunks.length / maxChunks));
    const context = chunks
      .filter((_, index) => index % step === 0)
      .slice(0, maxChunks)
      .map((chunk) => `[${chunk.startLabel || '0:00'}] ${chunk.text.slice(0, 250)}`)
      .join('\n\n');

    const batchSize = 5;
    const batches = [];
    for (let index = 0; index < count; index += batchSize) {
      batches.push(Math.min(batchSize, count - index));
    }

    const allQuestions = [];
    for (const batchCount of batches) {
      let batch = [];

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await this.aiClient.generateContent(this.buildQuizPrompt(batchCount, difficulty, context));
        batch = this.parseQuizResponse(result.response.text().trim());
        if (batch.length) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      allQuestions.push(...batch);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (!allQuestions.length) {
      throw new AppError('AI could not generate any valid questions. Please try again.', 502);
    }

    const seen = new Set();
    return allQuestions
      .filter((question) => {
        const key = question.question.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, count);
  }

  async getLatestSession(studentId, lessonId) {
    return this.chatSessionRepository.findLatestForLesson(studentId, lessonId);
  }

  async deleteSession(studentId, sessionId) {
    const deleted = await this.chatSessionRepository.deleteBySession(studentId, sessionId);
    if (!deleted) throw new AppError('Session not found.', 404);
  }
}

export default ChatService;
