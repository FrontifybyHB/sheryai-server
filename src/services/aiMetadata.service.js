class AiMetadataService {
  constructor(aiClient) {
    this.aiClient = aiClient;
  }

  async generateStarterQuestions(chunks, videoTitle) {
    const fallback = [
      `What is the main topic covered in "${videoTitle}"?`,
      'Can you summarize the key concepts explained?',
      'What are the most important points from this lecture?',
      'Are there any prerequisites I should know before watching this?',
      'What are practical applications of what was taught here?',
    ];

    try {
      const context = chunks
        .slice(0, 15)
        .map((chunk) => `[${chunk.startLabel}] ${chunk.text}`)
        .join('\n\n');

      const prompt = `You are an expert AI tutor analyzing a lecture video.

Video title: "${videoTitle}"

Transcript excerpt:
${context}

Generate exactly 5 specific, interesting questions a student might ask about this lecture.
Return ONLY a valid JSON array of 5 strings.`;

      const result = await this.aiClient.generateContent(prompt);
      const jsonMatch = result.response.text().trim().match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array in response');

      const questions = JSON.parse(jsonMatch[0]);
      return Array.isArray(questions) && questions.length ? questions.slice(0, 5) : fallback;
    } catch {
      return fallback;
    }
  }

  async generateTopicSegments(chunks) {
    try {
      if (!chunks?.length) return [];

      const duration = chunks[chunks.length - 1]?.endTime || chunks[chunks.length - 1]?.startTime || 0;
      const durationMin = Math.floor(duration / 60);
      const durationSec = Math.floor(duration % 60);
      const targetCount = Math.max(5, Math.min(20, Math.ceil(duration / 20)));
      const sampled = chunks.length <= 50
        ? chunks
        : chunks.filter((_, index) => index % Math.ceil(chunks.length / 50) === 0).slice(0, 50);

      const context = sampled
        .map((chunk) => `[${chunk.startLabel} / ${Math.floor(chunk.startTime)}s] ${chunk.text.substring(0, 300)}`)
        .join('\n');

      const prompt = `You create YouTube-style chapter markers.

Lecture transcript (total duration: ${durationMin}m ${durationSec}s):
${context}

Generate exactly ${targetCount} chapter timestamps covering the full video.
Return ONLY valid JSON:
[{"topic":"Topic Name","startTime":0,"startLabel":"0:00"}]

Rules:
1. First chapter MUST be startTime 0, startLabel "0:00"
2. Produce exactly ${targetCount} chapters
3. Use timestamps from the transcript, sorted ascending
4. Topic names must be 2-5 words, specific, no duplicates.`;

      const result = await this.aiClient.generateContent(prompt);
      const jsonMatch = result.response.text().trim().match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const raw = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(raw)) return [];

      const seen = new Set();
      const segments = raw
        .filter((segment) => segment.topic && typeof segment.startTime === 'number' && segment.startLabel)
        .sort((a, b) => a.startTime - b.startTime)
        .filter((segment) => {
          if (seen.has(segment.startTime)) return false;
          seen.add(segment.startTime);
          return true;
        })
        .slice(0, 20);

      if (segments.length > 0 && segments[0].startTime !== 0) {
        segments.unshift({ topic: 'Introduction', startTime: 0, startLabel: '0:00' });
      }

      return segments;
    } catch {
      return [];
    }
  }
}

export default AiMetadataService;
