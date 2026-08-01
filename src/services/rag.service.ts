import { prisma, getSchemaName } from '../lib/prisma';
import { AIService } from './ai.service';
import { ENV } from '../config/env';
import redisClient from '../lib/redis';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

/** 
 * Hybrid RRF search (vector + full-text).
 * Falls back to text-only search when pgvector is not installed (error 42704).
 */
export async function hybridSearchChunks(
  restaurantId: string,
  queryVectorStr: string,
  rewrittenQuery: string,
  extraWhere = '',  // e.g. "AND (rd.\"bucketId\" IS NULL OR rb.\"isChatEnabled\" = true)"
  bucketId?: string // exact-match a single bucket (used by the KB test endpoints)
): Promise<any[]> {
  const schemaName = await getSchemaName(restaurantId);
  const bucketFilter = bucketId ? `AND rd."bucketId" = $4` : '';
  const hybridParams = bucketId
    ? [queryVectorStr, restaurantId, rewrittenQuery, bucketId]
    : [queryVectorStr, restaurantId, rewrittenQuery];

  // ── Try 1: Full hybrid RRF (vector + text) ──────────────────
  try {
    return await prisma.$queryRawUnsafe<any[]>(
      `WITH vector_matches AS (
          SELECT dc.id, ROW_NUMBER() OVER (ORDER BY dc.embedding <=> $1::public.vector) as rank
          FROM "${schemaName}"."DocumentChunks" dc
          JOIN "${schemaName}"."RestaurantDocuments" rd ON dc."documentId" = rd.id
          LEFT JOIN "${schemaName}"."RestaurantBuckets" rb ON rd."bucketId" = rb.id
          WHERE rd."restaurantId" = $2 AND rd.status = 'INDEXED'
            ${extraWhere} ${bucketFilter}
          LIMIT 100
        ),
        text_matches AS (
          SELECT dc.id, ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', $3)) DESC) as rank
          FROM "${schemaName}"."DocumentChunks" dc
          JOIN "${schemaName}"."RestaurantDocuments" rd ON dc."documentId" = rd.id
          LEFT JOIN "${schemaName}"."RestaurantBuckets" rb ON rd."bucketId" = rb.id
          WHERE rd."restaurantId" = $2 AND rd.status = 'INDEXED'
            ${extraWhere} ${bucketFilter}
            AND to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $3)
          LIMIT 100
        )
        SELECT dc.content, rd.filename, dc."documentId" as "documentId",
               (COALESCE(1.0 / (60.0 + vm.rank), 0.0) + COALESCE(1.0 / (60.0 + tm.rank), 0.0)) as rrf_score
        FROM "${schemaName}"."DocumentChunks" dc
        JOIN "${schemaName}"."RestaurantDocuments" rd ON dc."documentId" = rd.id
        LEFT JOIN vector_matches vm ON dc.id = vm.id
        LEFT JOIN text_matches tm ON dc.id = tm.id
        WHERE vm.id IS NOT NULL OR tm.id IS NOT NULL
        ORDER BY rrf_score DESC
        LIMIT 10`,
      ...hybridParams
    );
  } catch (vecErr: any) {
    // ── Fallback: text-only search when pgvector not installed (code 42704) ──
    const isPgVectorMissing =
      vecErr?.meta?.code === '42704' ||
      (typeof vecErr?.message === 'string' && vecErr.message.includes('vector'));

    if (!isPgVectorMissing) throw vecErr; // Re-throw unrelated errors

    console.warn('[RAGService] pgvector not available, falling back to full-text search only.');

    const textOnlyBucketFilter = bucketId ? `AND rd."bucketId" = $3` : '';
    const textOnlyParams = bucketId
      ? [rewrittenQuery, restaurantId, bucketId]
      : [rewrittenQuery, restaurantId];

    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT dc.content, rd.filename, dc."documentId" as "documentId",
              ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', $1)) as rrf_score
       FROM "${schemaName}"."DocumentChunks" dc
       JOIN "${schemaName}"."RestaurantDocuments" rd ON dc."documentId" = rd.id
       LEFT JOIN "${schemaName}"."RestaurantBuckets" rb ON rd."bucketId" = rb.id
       WHERE rd."restaurantId" = $2 AND rd.status = 'INDEXED'
         ${extraWhere} ${textOnlyBucketFilter}
         AND to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', $1)
       ORDER BY rrf_score DESC
       LIMIT 10`,
      ...textOnlyParams
    );
  }
}

export class RAGService {
  /**
   * Streaming generator for Restaurant RAG Query.
   */
  public static async *queryRestaurantStream(
    restaurantId: string,
    userQuery: string,
    history: ChatMessage[] = [],
    userPreferences?: string,
    sessionId?: string,
    cartItems?: any[]
  ): AsyncGenerator<{ text?: string; done: boolean; securityTriggered?: boolean; error?: string; sources?: string[] }> {
    try {
      // 1. Manage session & Load history
      let chatSession: any = null;
      let activeHistory = [...history];

      if (sessionId) {
        chatSession = await prisma.aIChatSession.findUnique({
          where: { sessionId },
          include: { messages: { orderBy: { createdAt: 'asc' } } }
        });

        if (!chatSession) {
          chatSession = await prisma.aIChatSession.create({
            data: {
              sessionId,
              restaurantId,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h TTL
            },
            include: { messages: true }
          });
        } else {
          await prisma.aIChatSession.update({
            where: { id: chatSession.id },
            data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
          });
        }

        if (activeHistory.length === 0 && chatSession.messages.length > 0) {
          activeHistory = chatSession.messages.map((m: any) => ({
            role: m.role as 'user' | 'model' | 'system',
            content: m.content
          }));
        }
      }

      // 2. Conversation Summarization (if history exceeds threshold)
      let summaryText = '';
      if (activeHistory.length > ENV.AI.RAG_HISTORY_SUMMARIZATION_THRESHOLD) {
        console.log(`[RAGService] History length (${activeHistory.length}) exceeds 10. Summarizing...`);
        const toSummarize = activeHistory.slice(0, -2);
        const lastTwo = activeHistory.slice(-2);

        const summaryPrompt = `Tóm tắt ngắn gọn nội dung cuộc đối thoại bằng tiếng Việt trong khoảng 2-3 câu.
Tập trung vào: món ăn khách quan tâm, đặt bàn, hoặc các giải đáp cốt lõi.
Lịch sử cuộc gọi:
${toSummarize.map(m => `${m.role === 'model' ? 'AI' : 'Khách'}: ${m.content}`).join('\n')}

Tóm tắt ngắn gọn:`;

        try {
          const summaryResponse = await AIService.generateContent({
            model: ENV.AI.DEFAULT_MODEL,
            contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }],
          });
          summaryText = summaryResponse.text ? summaryResponse.text.trim() : '';
          console.log(`[RAGService] Summarized: "${summaryText}"`);

          activeHistory = [
            { role: 'system', content: `Tóm tắt hội thoại trước đó: ${summaryText}` },
            ...lastTwo
          ];
        } catch (sumErr) {
          console.error('[RAGService] Summarization error:', sumErr);
        }
      }

      // 3. Rewrite query to be self-contained
      const historyForRewriter = activeHistory
        .filter(h => h.role !== 'system')
        .map((h) => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.content,
        }));
      const rewrittenQuery = await AIService.rewriteQuery(userQuery, historyForRewriter);
      console.log(`[RAGService] Rewritten: "${rewrittenQuery}"`);

      // ── TỐI ƯU: chạy SONG SONG injection-check + truy hồi tài liệu + nạp menu ──
      // (đều chỉ phụ thuộc rewrittenQuery). Trước đây tuần tự → chậm.

      // #2 Guard: bỏ qua embedding/search/rerank nếu nhà hàng CHƯA có tài liệu KB
      const runRetrieval = async (): Promise<{ contextText: string; topChunks: any[] }> => {
        const docCount = await prisma.restaurantDocument.count({ where: { restaurantId, status: 'INDEXED' } });
        if (docCount === 0) {
          return { contextText: 'Không có tài liệu tham khảo đặc thù nào.', topChunks: [] };
        }
        const queryEmbedding = await AIService.generateEmbedding(rewrittenQuery);
        const queryVectorStr = `[${queryEmbedding.join(',')}]`;
        const dbChunks = await hybridSearchChunks(
          restaurantId,
          queryVectorStr,
          rewrittenQuery,
          `AND (rd."bucketId" IS NULL OR rb."isChatEnabled" = true)`,
        );
        let reranked = dbChunks || [];
        if (reranked.length > 0) {
          try {
            const texts = reranked.map((c: any) => c.content);
            const results = await AIService.cohereRerank(rewrittenQuery, texts, ENV.AI.RAG_MAX_CHUNKS || 5);
            reranked = results
              .map((r: any) => { const ch = reranked[r.index]; return ch ? { ...ch, cohere_score: r.score } : null; })
              .filter((c: any): c is any => !!c);
          } catch (rerankErr) {
            console.warn('[RAGService] Cohere Rerank failed, using RRF order:', rerankErr);
          }
        }
        const top = reranked.slice(0, ENV.AI.RAG_MAX_CHUNKS);
        const ctx = top.length > 0
          ? top.map((c: any) => `[Tài liệu: ${c.filename}]\n${c.content}`).join('\n\n---\n\n')
          : 'Không có tài liệu tham khảo đặc thù nào.';
        return { contextText: ctx, topChunks: top };
      };

      // #3 Cache menu context (Redis, TTL 5 phút) — tránh findMany mỗi request
      const runMenuContext = async (): Promise<string> => {
        if (restaurantId === 'system') return '';
        const cacheKey = `menu_ctx:${restaurantId}`;
        try { const cached = await redisClient.get(cacheKey); if (cached !== null) return cached; } catch { /* redis down */ }
        const [activeDishes, activeCombos] = await Promise.all([
          prisma.dish.findMany({ where: { restaurantId, isActive: true }, select: { id: true, name: true, price: true, unit: true }, take: 50 }),
          prisma.mealCombo.findMany({ where: { restaurantId, isActive: true }, select: { id: true, name: true, price: true }, take: 20 }),
        ]);
        let text = '';
        if (activeDishes.length > 0 || activeCombos.length > 0) {
          const menuList = [
            ...activeDishes.map((d: any) => ({ type: 'dish', id: d.id, name: d.name, price: Number(d.price), unit: d.unit })),
            ...activeCombos.map((c: any) => ({ type: 'combo', id: c.id, name: c.name, price: Number(c.price), unit: 'phần' })),
          ];
          text = `\nDanh sách món ăn & combo có sẵn tại nhà hàng:\n${JSON.stringify(menuList, null, 2)}`;
        }
        try { await redisClient.setEx(cacheKey, 300, text); } catch { /* redis down */ }
        return text;
      };

      // #1 Song song hóa 3 việc độc lập
      const [isSafe, retrieval, menuContextText] = await Promise.all([
        AIService.checkPromptInjection(rewrittenQuery),
        runRetrieval(),
        runMenuContext(),
      ]);

      if (!isSafe) {
        yield {
          text: 'Hệ thống phát hiện nội dung truy vấn không an toàn. Vui lòng đặt câu hỏi khác.',
          done: true,
          securityTriggered: true,
        };
        return;
      }

      const topChunks = retrieval.topChunks;
      const contextText = retrieval.contextText;

      // 8. Fetch AI Configuration from DB
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { metadata: true, name: true }
      });

      if (!restaurant) {
        yield { error: 'Không tìm thấy nhà hàng.', done: true };
        return;
      }

      const metadata = (restaurant.metadata as any) || {};
      const aiConfig = metadata.aiConfig || {};

      if (aiConfig.isChatEnabled === false) {
        yield {
          text: 'Trợ lý ảo AI của nhà hàng hiện đang tạm thời tắt. Vui lòng liên hệ trực tiếp nhân viên phục vụ để được hỗ trợ.',
          done: true
        };
        return;
      }

      const defaultSystemPrompt = `Bạn là trợ lý AI thông minh của nhà hàng "${restaurant.name}".
Nhiệm vụ của bạn là hỗ trợ khách hàng tìm hiểu thực đơn, giá cả các món ăn, hướng dẫn đặt bàn và các dịch vụ đi kèm.
Hãy luôn lịch sự, thân thiện và nhiệt tình với khách hàng.`;

      const customPrompt = aiConfig.systemPrompt || defaultSystemPrompt;

      // Dynamic guidelines matching UI selections
      let dynamicGuidelines = '';
      if (aiConfig.botName) {
        dynamicGuidelines += `\n- Tên của bạn là "${aiConfig.botName}". Hãy luôn xưng hô và tự giới thiệu bằng tên này khi giao tiếp.`;
      }

      const roleMap: Record<string, string> = {
        advisor: 'Nhân viên tư vấn nhiệt tình, tập trung giới thiệu thực đơn, tư vấn món ăn ngon và giải đáp câu hỏi về đồ ăn thức uống.',
        receptionist: 'Lễ tân đặt bàn chuyên nghiệp, tập trung hỗ trợ khách đặt bàn, chọn chỗ ngồi và kiểm tra thời gian đón tiếp khách.',
        care: 'Chăm sóc khách hàng chu đáo, lắng nghe các thắc mắc, phản hồi khiếu nại và ghi nhận ý kiến từ phía khách.'
      };
      const toneMap: Record<string, string> = {
        friendly: 'Thân thiện, ấm áp, gần gũi, dùng ngôn từ tự nhiên, lịch sự và thân mật.',
        professional: 'Chuyên nghiệp, chuẩn mực, lịch sự, rõ ràng và tập trung vào sự chính xác.',
        luxury: 'Sang trọng, tinh tế, trang trọng, cực kỳ tôn trọng và sử dụng các kính ngữ trang trọng để tôn vinh khách hàng.',
        cheerful: 'Vui vẻ, hào hứng, tràn đầy năng lượng tích cực, cởi mở và thường xuyên sử dụng emoji vui tươi.'
      };

      const activeRole = aiConfig.aiRole || 'advisor';
      const activeTone = aiConfig.tone || 'friendly';
      dynamicGuidelines += `\n- VAI TRÒ CỦA BẠN: Bạn đóng vai trò là một ${roleMap[activeRole] || roleMap.advisor}`;
      dynamicGuidelines += `\n- PHONG CÁCH GIAO TIẾP: Sử dụng giọng điệu ${toneMap[activeTone] || toneMap.friendly}`;

      // Enforce response boundaries based on allowed options
      const limits = aiConfig.replyLimits || {};
      const forbiddenTopics: string[] = [];
      if (limits.menu === false) forbiddenTopics.push('thực đơn (menu)');
      if (limits.price === false) forbiddenTopics.push('giá tiền các món ăn');
      if (limits.promo === false) forbiddenTopics.push('khuyến mãi hoặc ưu đãi');
      if (limits.hours === false) forbiddenTopics.push('giờ mở cửa của nhà hàng');
      if (limits.address === false) forbiddenTopics.push('địa chỉ, bản đồ hay vị trí nhà hàng');
      if (limits.policy === false) forbiddenTopics.push('chính sách đặt bàn hay quy định cọc tiền');
      if (limits.dishInfo === false) forbiddenTopics.push('thành phần chi tiết hoặc cách chế biến món ăn');

      if (forbiddenTopics.length > 0) {
        dynamicGuidelines += `\n- GIỚI HẠN PHẠM VI: Chủ nhà hàng đã tắt quyền trả lời về: ${forbiddenTopics.join(', ')}. Tuyệt đối KHÔNG trả lời hay tiết lộ các thông tin này dưới bất kỳ hình thức nào. Nếu khách hỏi, hãy xin lỗi và lịch sự từ chối trả lời do quy định của nhà hàng.`;
      }

      // Fallback Strategy
      if (aiConfig.fallbackStrategy === 'sorry') {
        dynamicGuidelines += `\n- NGUYÊN TẮC THIẾU THÔNG TIN: Nếu thông tin khách hỏi không xuất hiện trong tài liệu hoặc thực đơn ở trên, hãy trả lời chính xác bằng câu mặc định: "Xin lỗi, em chưa có thông tin chính xác. Anh/chị vui lòng liên hệ nhân viên để được hỗ trợ." Không được tự sáng tạo hoặc suy đoán ngoài ngữ cảnh.`;
      } else {
        dynamicGuidelines += `\n- NGUYÊN TẮC THIẾU THÔNG TIN: Nếu không có dữ liệu trực tiếp trong ngữ cảnh, hãy tự suy luận một cách logic, thông minh và an toàn nhất dựa trên các thông tin tương tự có sẵn để giải đáp thắc mắc cho khách hàng.`;
      }

      // Human handoff triggers
      const handoff = aiConfig.handoffTriggers || {};
      const handoffCases: string[] = [];
      if (handoff.clientRequest) handoffCases.push('khách yêu cầu gặp nhân viên / người thật / quản lý');
      if (handoff.unknownQuery) handoffCases.push('bạn không biết câu trả lời hoặc không có thông tin');
      if (handoff.complaint) handoffCases.push('khách hàng có thái độ khiếu nại, bức xúc hoặc không hài lòng');
      if (handoff.refund) handoffCases.push('yêu cầu hoàn tiền, hủy đơn hoặc bồi thường');

      if (handoffCases.length > 0) {
        dynamicGuidelines += `\n- CHUYỂN GIAO CHO NHÂN VIÊN: Khi phát hiện các tình huống (${handoffCases.join(', ')}), hãy nhắn khách rằng bạn đang kết nối họ tới nhân viên phục vụ và BẮT BUỘC phải nhúng thẻ hành động [ACTION: CALL_WAITER] vào câu trả lời để hệ thống kích hoạt chuông gọi phục vụ thực tế.`;
      }

      // Booking collection rules
      const bookingInfo = aiConfig.collectBookingInfo || {};
      const requiredFields: string[] = [];
      if (bookingInfo.guests) requiredFields.push('số người tham gia');
      if (bookingInfo.datetime) requiredFields.push('ngày và giờ đặt bàn mong muốn');
      if (bookingInfo.phone) requiredFields.push('số điện thoại liên hệ');
      if (bookingInfo.note) requiredFields.push('ghi chú/yêu cầu đặc biệt (ví dụ: ăn chay, bàn ban công...)');

      if (requiredFields.length > 0) {
        dynamicGuidelines += `\n- QUY TRÌNH THU THẬP ĐẶT BÀN: Khi khách hàng ngỏ ý muốn đặt bàn (booking), hãy hỏi khách lần lượt các thông tin còn thiếu trong danh sách sau: ${requiredFields.join(', ')}. Hãy hỏi một cách lịch sự, tự nhiên. Khi khách cung cấp thông tin hoặc bạn thấy khách sẵn sàng điền form đặt bàn, hãy nhúng thẻ [UI: BOOKING_FORM ...] ở cuối phản hồi của bạn.`;
      }

      const systemInstruction = `${customPrompt}
${dynamicGuidelines}

${userPreferences ? `Thông tin khách hàng: ${userPreferences}` : ''}

Ngữ cảnh tài liệu nhà hàng hỗ trợ (Knowledge Base Context):
========================================
${contextText}
========================================

${menuContextText}

QUY TẮC QUAN TRỌNG:
1. Chỉ trả lời dựa trên thông tin thực tế từ Ngữ cảnh tài liệu và Danh sách món ăn/combo có sẵn ở trên. Nếu không biết hoặc thông tin không có trong tài liệu/thực đơn, hãy trả lời lịch sự rằng bạn không có thông tin chính xác và khuyên khách hỏi nhân viên phục vụ.
2. KHÔNG tự bịa đặt món ăn, giá cả hoặc chính sách không có trong ngữ cảnh.
3. Khi khách muốn đặt món hoặc thêm vào giỏ hàng, hoặc gọi phục vụ, hãy hướng dẫn họ, hoặc phản hồi kèm theo thẻ ACTION nếu phù hợp.
Ví dụ:
- Để thêm món ăn vào giỏ hàng, trả về cú pháp: [ACTION: ADD_TO_CART {"id": "DISH_ID", "name": "Tên Món", "price": 120000, "quantity": 1}]
- Để làm trống giỏ hàng: [ACTION: CLEAR_CART]
- Để xem giỏ hàng: [ACTION: OPEN_CART]
- Để gọi phục vụ: [ACTION: CALL_WAITER]
Đảm bảo định dạng JSON trong thẻ ACTION hoàn toàn hợp lệ và chính xác với DISH_ID lấy từ danh sách món ăn ở trên.

4. Khi phù hợp, nhúng đúng 1 thẻ [UI:] vào CUỐI câu trả lời để hiển thị giao diện tương tác.
- Khi AI gợi ý 1 món ăn cụ thể và khách tỏ ra quan tâm → thêm:
[UI: DISH_CONFIRM {"id":"DISH_ID","name":"Tên Món","price":75000}]
(Thay bằng id/name/price thực từ danh sách menu)
- Khi khách muốn ĐẶT BÀN → thêm:
[UI: BOOKING_FORM {"restaurantName":"${restaurant.name}"}]
- KHÔNG dùng cả [ACTION:] và [UI:] cùng lúc cho cùng 1 hành động.`;

      // 9. Assemble contents for generation
      const contents: any[] = [];
      for (const msg of activeHistory) {
        if (msg.role === 'system') continue;
        contents.push({
          role: msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: rewrittenQuery }],
      });

      // Call streaming
      const responseStream = await AIService.generateContentStream({
        model: aiConfig.aiModel || ENV.AI.DEFAULT_MODEL,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: aiConfig.temperature !== undefined ? Number(aiConfig.temperature) : 0.2,
        }
      });

      let fullAnswer = '';
      for await (const chunk of responseStream) {
        const text = chunk.text || '';
        fullAnswer += text;
        yield { text, done: false };
      }

      // 10. Post-processing (PII validation) & Database save
      const sanitizedAnswer = await AIService.validatePII(fullAnswer);

      if (chatSession) {
        await prisma.aIChatMessage.create({
          data: { aiChatSessionId: chatSession.id, role: 'user', content: userQuery }
        });
        const modelMessage = await prisma.aIChatMessage.create({
          data: { aiChatSessionId: chatSession.id, role: 'model', content: sanitizedAnswer }
        });

        // Run RAGAS evaluation in the background using setImmediate
        setImmediate(async () => {
          try {
            const scores = await AIService.ragasEvaluate(userQuery, sanitizedAnswer, topChunks);
            await prisma.aIChatMessage.update({
              where: { id: modelMessage.id },
              data: {
                metadata: {
                  ragas: scores
                }
              }
            });
            console.log(`[RAGService] Evaluated message ${modelMessage.id}:`, scores);
          } catch (evalErr) {
            console.error('[RAGService] Background Ragas evaluation error:', evalErr);
          }
        });
      }

      // A1: Trích nguồn — trả về tên các tài liệu đã dùng để khách/chủ tin cậy
      const sources = Array.from(new Set(topChunks.map((c: any) => c.filename).filter(Boolean)));
      yield { done: true, sources };
    } catch (err: any) {
      console.error('[RAGService Stream] Error:', err);
      yield { error: err.message || 'Lỗi server khi streaming.', done: true };
    }
  }

  /**
   * Legacy queryRestaurant wrapper utilizing stream output.
   */
  public static async queryRestaurant(
    restaurantId: string,
    userQuery: string,
    history: ChatMessage[] = [],
    userPreferences?: string,
    sessionId?: string,
    cartItems?: any[]
  ): Promise<{ success: boolean; answer: string; sessionId?: string; securityTriggered?: boolean }> {
    try {
      const stream = this.queryRestaurantStream(restaurantId, userQuery, history, userPreferences, sessionId, cartItems);
      let answer = '';
      let securityTriggered = false;

      for await (const chunk of stream) {
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.securityTriggered) securityTriggered = true;
        if (chunk.text) answer += chunk.text;
      }

      return {
        success: !securityTriggered,
        answer: answer || 'Không thể xử lý yêu cầu.',
        sessionId,
        securityTriggered,
      };
    } catch (err) {
      console.error('[RAGService] queryRestaurant wrapper error:', err);
      return {
        success: false,
        answer: 'Đã xảy ra lỗi khi trợ lý AI xử lý câu hỏi. Vui lòng thử lại sau.',
        sessionId,
      };
    }
  }

  /**
   * Streaming generator for System RAG Chatbot.
   */
  public static async *querySystemStream(
    userQuery: string,
    history: ChatMessage[] = []
  ): AsyncGenerator<{ text?: string; done: boolean; securityTriggered?: boolean; error?: string }> {
    try {
      // 1. Summarization if history > 10 messages
      let activeHistory = [...history];
      let summaryText = '';
      if (activeHistory.length > ENV.AI.RAG_HISTORY_SUMMARIZATION_THRESHOLD) {
        console.log(`[RAGService System] History length (${activeHistory.length}) exceeds 10. Summarizing...`);
        const toSummarize = activeHistory.slice(0, -2);
        const lastTwo = activeHistory.slice(-2);

        const summaryPrompt = `Tóm tắt ngắn gọn nội dung cuộc đối thoại bằng tiếng Việt trong khoảng 2-3 câu.
Tập trung vào: tính năng hệ thống họ hỏi và các vấn đề được giải quyết.
Lịch sử cuộc gọi:
${toSummarize.map(m => `${m.role === 'model' ? 'AI' : 'Khách'}: ${m.content}`).join('\n')}

Tóm tắt ngắn gọn:`;

        try {
          const summaryResponse = await AIService.generateContent({
            model: ENV.AI.DEFAULT_MODEL,
            contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }],
          });
          summaryText = summaryResponse.text ? summaryResponse.text.trim() : '';
          console.log(`[RAGService System] Summarized: "${summaryText}"`);

          activeHistory = [
            { role: 'system', content: `Tóm tắt hội thoại trước đó: ${summaryText}` },
            ...lastTwo
          ];
        } catch (sumErr) {
          console.error('[RAGService System] Summarization error:', sumErr);
        }
      }

      // 2. Rewrite query
      const historyForRewriter = activeHistory
        .filter(h => h.role !== 'system')
        .map((h) => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.content,
        }));
      const rewrittenQuery = await AIService.rewriteQuery(userQuery, historyForRewriter);
      console.log(`[RAGService System] Rewritten: "${rewrittenQuery}"`);

      // 3. Anti-injection check
      const isSafe = await AIService.checkPromptInjection(rewrittenQuery);
      if (!isSafe) {
        yield {
          text: 'Hệ thống phát hiện nội dung truy vấn không an toàn. Vui lòng đặt câu hỏi khác.',
          done: true,
          securityTriggered: true
        };
        return;
      }

      // 4. Retrieve context from System Documents
      const systemDocsCount = await prisma.restaurantDocument.count({
        where: { restaurantId: 'system', status: 'INDEXED' }
      });

      let contextText = '';
      if (systemDocsCount > 0) {
        const queryEmbedding = await AIService.generateEmbedding(rewrittenQuery);
        const queryVectorStr = `[${queryEmbedding.join(',')}]`;

        const dbChunks = await hybridSearchChunks(
          'system',
          queryVectorStr,
          rewrittenQuery
        );

        if (dbChunks && dbChunks.length > 0) {
          let rerankedChunks = dbChunks;
          try {
            const documentTexts = rerankedChunks.map(c => c.content);
            const rerankedResults = await AIService.cohereRerank(
              rewrittenQuery,
              documentTexts,
              ENV.AI.RAG_MAX_CHUNKS || 5
            );
            rerankedChunks = rerankedResults.map(r => {
              const chunk = rerankedChunks[r.index];
              if (chunk) {
                return { ...chunk, cohere_score: r.score };
              }
              return null;
            }).filter((c): c is any => !!c);
          } catch (rerankErr) {
            console.warn('[RAGService System] Cohere Rerank failed, using database RRF order:', rerankErr);
          }
          const topChunks = rerankedChunks.slice(0, ENV.AI.RAG_MAX_CHUNKS);
          contextText = topChunks.map((c) => `[Tài liệu: ${c.filename}]\n${c.content}`).join('\n\n---\n\n');
        }
      }

      const contextSection = contextText
        ? `Ngữ cảnh tài liệu hệ thống hỗ trợ (Knowledge Base Context):
========================================
${contextText}
========================================
QUY TẮC: Sử dụng thông tin ngữ cảnh hệ thống ở trên để bổ sung kiến thức trả lời chính xác.`
        : '';

      // 1. Fetch AI Configuration from DB
      const systemRestaurant = await prisma.restaurant.findUnique({
        where: { id: 'system' },
        select: { metadata: true }
      });
      const systemMetadata = (systemRestaurant?.metadata as any) || {};
      const systemAiConfig = systemMetadata.aiConfig || {};

      if (systemAiConfig.isChatEnabled === false) {
        yield {
          text: 'Trợ lý ảo hệ thống hiện đang tạm thời tắt. Vui lòng thử lại sau.',
          done: true
        };
        return;
      }

      const defaultSystemPrompt = `Bạn là trợ lý AI thông minh của nền tảng "XFoodi" (Hệ thống SaaS quản lý nhà hàng đa tenant).
Bạn chỉ trả lời các câu hỏi liên quan đến nền tảng XFoodi, cách đăng ký tài khoản nhà hàng, các gói dịch vụ (Free, Pro), tính năng phần mềm (như gọi món QR, đặt bàn online, KDS nhà bếp, quản lý nhân viên, quản lý kho nguyên liệu).

Chính sách gói dịch vụ tham khảo:
1. Gói FREE: Phù hợp cho nhà hàng nhỏ dưới 5 bàn. Có tính năng gọi món QR cơ bản, báo cáo đơn giản. Giới hạn upload 2MB tài liệu AI.
2. Gói PRO: Phù hợp cho chuỗi nhà hàng, không giới hạn bàn. Hỗ trợ xem sơ đồ bàn 3D, RAG AI chatbot, quản lý kho nâng cao, tích hợp cổng thanh toán PayOS. Giá 499.000đ / tháng.
3. Quy trình đăng ký: Chủ cửa hàng điền form ứng tuyển tại "/register-restaurant", sau đó Super Admin sẽ kiểm duyệt và cấp phát tenant subdomain (ví dụ: "nhahangcua-ban.xfoodi.website").

Quy tắc:
1. Trả lời lịch sự, ngắn gọn và hữu ích.
2. Nếu câu hỏi không liên quan gì đến XFoodi, hãy từ chối lịch sự: "Tôi là trợ lý ảo của XFoodi và chỉ có thể trả lời các câu hỏi liên quan đến nền tảng quản lý nhà hàng XFoodi."

== HƯỚNG DẪN UI CARD TƯƠNG TÁC ==
Khi phù hợp, nhúng đúng 1 thẻ [UI:] vào CUỐI câu trả lời để hiển thị giao diện tương tác. JSON phải hợp lệ.

• Người dùng hỏi GIÁ, GÓI DỊCH VỤ, CHI PHÍ → thêm:
[UI: PRICING_CARD {"highlight":"pro"}]

• Người dùng hỏi TÍNH NĂNG, SO SÁNH, CHỨC NĂNG → thêm:
[UI: FEATURE_CARD {"features":["Gọi món QR","Đặt bàn online","KDS nhà bếp","Quản lý kho","Báo cáo & thống kê","AI Chatbot RAG","Sơ đồ bàn 3D","Quản lý nhân viên"]}]

• Người dùng muốn ĐĂNG KÝ, DÙNG THỬ, TÌM HIỂU THÊM → thêm:
[UI: CTA_CARD {"action":"register","label":"Đăng ký dùng thử miễn phí 🚀","url":"/register-restaurant","note":"Miễn phí, không cần thẻ tín dụng"}]

• Người dùng hỏi QUY TRÌNH ĐĂNG KÝ, CÁC BƯỚC → thêm:
[UI: STEPS_CARD {"steps":["Điền form đăng ký nhà hàng","Admin kiểm duyệt hồ sơ trong 24h","Nhận subdomain riêng của nhà hàng","Cấu hình menu & bắt đầu vận hành"]}]`;

      const customPrompt = systemAiConfig.systemPrompt || defaultSystemPrompt;

      const systemPromptText = `${customPrompt}

${contextSection}`;

      // Assemble content
      const contents: any[] = [];
      for (const msg of activeHistory) {
        if (msg.role === 'system') continue;
        contents.push({
          role: msg.role === 'model' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: rewrittenQuery }],
      });

      // Call streaming
      const responseStream = await AIService.generateContentStream({
        model: systemAiConfig.aiModel || ENV.AI.DEFAULT_MODEL,
        contents: contents,
        config: {
          systemInstruction: systemPromptText,
          temperature: systemAiConfig.temperature !== undefined ? Number(systemAiConfig.temperature) : ENV.AI.DEFAULT_TEMPERATURE,
        }
      });

      for await (const chunk of responseStream) {
        yield { text: chunk.text || '', done: false };
      }

      yield { done: true };
    } catch (err: any) {
      console.error('[RAGService System Stream] Error:', err);
      yield { error: err.message || 'Lỗi server khi streaming hệ thống.', done: true };
    }
  }

  /**
   * Legacy querySystem wrapper utilizing stream output.
   */
  public static async querySystem(
    userQuery: string,
    history: ChatMessage[] = []
  ): Promise<{ success: boolean; answer: string }> {
    try {
      const stream = this.querySystemStream(userQuery, history);
      let answer = '';

      for await (const chunk of stream) {
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.text) answer += chunk.text;
      }

      return {
        success: true,
        answer: answer || 'Không thể xử lý yêu cầu.',
      };
    } catch (err) {
      console.error('[RAGService] querySystem wrapper error:', err);
      return {
        success: false,
        answer: 'Đã xảy ra lỗi khi trợ lý hệ thống xử lý câu hỏi. Vui lòng thử lại sau.',
      };
    }
  }
}
