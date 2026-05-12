import { v4 as uuidv4 } from 'uuid';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';

class ChatController {
  constructor(chatService) {
    this.chatService = chatService;
  }

  stream = asyncHandler(async (req, res) => {
    const { lessonId, message, currentTime } = req.body;
    const sessionId = req.body.sessionId || uuidv4();
    const history = await this.chatService.getSessionHistory(req.user.uid, lessonId, sessionId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Chat-Session-Id', sessionId);
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`);

    let clientAborted = false;
    req.on('close', () => {
      if (!res.writableEnded) {
        clientAborted = true;
        res.end();
      }
    });

    let fullResponse = '';
    let followUps = [];

    try {
      for await (const event of this.chatService.streamChat({
        lessonId,
        sessionId,
        message,
        currentTime,
        history,
      })) {
        if (clientAborted || res.writableEnded) break;

        if (event.type === 'token') fullResponse += event.content;
        if (event.type === 'followUps') followUps = event.items || [];
        if (event.type === 'done') {
          fullResponse = event.fullResponse || fullResponse;
          followUps = event.followUps || followUps;
        }

        const { fullResponse: _fullResponse, followUps: _savedFollowUps, ...publicEvent } = event;
        res.write(`data: ${JSON.stringify(publicEvent)}\n\n`);
      }
    } catch {
      if (!clientAborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service error. Please try again.' })}\n\n`);
      }
    }

    if (!res.writableEnded) res.end();

    if (fullResponse && !clientAborted) {
      setImmediate(() => this.chatService.saveSessionMessage(
        sessionId,
        lessonId,
        req.user.uid,
        message,
        fullResponse,
        followUps,
      ));
    }

  });

  summary = asyncHandler(async (req, res) => {
    const { lessonId, type, startTime, endTime } = req.body;
    const summary = await this.chatService.generateSummary(lessonId, type, startTime, endTime);
    res.json(ApiResponse.success({ summary }, 'Summary generated'));
  });

  quiz = asyncHandler(async (req, res) => {
    const { lessonId, count, type, difficulty } = req.body;
    const questions = await this.chatService.generateQuiz(lessonId, count, type, difficulty);
    res.json(ApiResponse.success({ questions }, 'Quiz generated'));
  });

  latestSession = asyncHandler(async (req, res) => {
    const session = await this.chatService.getLatestSession(req.user.uid, req.params.lessonId);
    res.json(ApiResponse.success({ session }, 'Session fetched'));
  });

  deleteSession = asyncHandler(async (req, res) => {
    await this.chatService.deleteSession(req.user.uid, req.params.sessionId);
    res.json(ApiResponse.success({ message: 'Session cleared.' }, 'Session cleared'));
  });
}

export default ChatController;
