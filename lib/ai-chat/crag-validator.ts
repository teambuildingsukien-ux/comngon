/**
 * 🛡️ CRAG — Corrective RAG Validator
 * Kiểm tra chất lượng retrieval + response
 * Nếu phát hiện hallucination (bịa số liệu) → đánh dấu cần retry
 */

export type CRAGVerdict = 'correct' | 'ambiguous' | 'incorrect';

export interface CRAGResult {
    verdict: CRAGVerdict;
    confidence: number; // 0-1
    reasons: string[];
}

/**
 * Validate response dựa trên retrieved context
 * Lightweight check — không gọi thêm LLM
 */
export function validateResponse(
    query: string,
    retrievedContents: string[],
    response: string
): CRAGResult {
    const reasons: string[] = [];
    let score = 1.0;

    // 1. Check: response có chứa số liệu không có trong context?
    const numbersInResponse = response.match(/\d+(?:[.,]\d+)?/g) || [];
    const allContextText = retrievedContents.join(' ');

    // ⚠️ AUDIT-FIX: Extract tất cả số trong context để check range
    const contextNumbers = (allContextText.match(/\d+(?:[.,]\d+)?/g) || [])
        .map(n => parseFloat(n.replace(',', '.')))
        .filter(n => !isNaN(n));
    const contextMin = contextNumbers.length > 0 ? Math.min(...contextNumbers) : 0;
    const contextMax = contextNumbers.length > 0 ? Math.max(...contextNumbers) : 0;

    // ⚠️ AUDIT-FIX: Kiểm tra nếu query hỏi về tỷ lệ/phần trăm
    const isPercentQuery = /tỷ lệ|phần trăm|%|ratio|percent|trung bình|average|rate/i.test(query);

    const suspiciousNumbers: string[] = [];
    for (const num of numbersInResponse) {
        // Skip trivially common numbers
        if (['0', '1', '2', '3', '100'].includes(num)) continue;
        if (num.length > 8) continue; // Skip very long numbers (dates, IDs)

        // ⚠️ AUDIT-FIX #1: Bỏ qua số phần trăm (0-100) khi query về tỷ lệ
        // AI tính "78.9%" từ raw data là hoàn toàn hợp lệ
        const numVal = parseFloat(num.replace(',', '.'));
        if (isPercentQuery && numVal >= 0 && numVal <= 100) continue;

        // ⚠️ AUDIT-FIX #2: Bỏ qua số nằm trong khoảng hợp lý của context
        // Nếu context có số từ 40→60, AI tính ra 78 (tổng) là hợp lệ
        if (contextNumbers.length > 0 && numVal >= contextMin * 0.5 && numVal <= contextMax * 3) continue;

        if (!allContextText.includes(num)) {
            suspiciousNumbers.push(num);
        }
    }

    // ⚠️ AUDIT-FIX #3: Tăng ngưỡng lên 6 (thay vì 3) để giảm false positive
    if (suspiciousNumbers.length > 6) {
        score -= 0.3;
        reasons.push(`${suspiciousNumbers.length} số liệu trong response không tìm thấy trong context: ${suspiciousNumbers.slice(0, 5).join(', ')}`);
    }


    // 2. Check: response có quá chung chung không? (thiếu cụ thể)
    const vaguePatterns = [
        /không có (đủ )?thông tin/i,
        /tôi không (thể|biết)/i,
        /chưa có dữ liệu/i,
        /cần thêm thông tin/i,
    ];
    const isVague = vaguePatterns.some(p => p.test(response));
    if (isVague && retrievedContents.length > 3) {
        score -= 0.2;
        reasons.push('Response nói "không có thông tin" nhưng có đủ context data');
    }

    // 3. Check: retrieved chunks có liên quan đến query không?
    const queryKeywords = query.toLowerCase()
        .replace(/[^\wàáạãảăắặẵẳâấậẫẩèéẹẽẻêếệễểìíịĩỉòóọõỏôốộỗổơớợỡởùúụũủưứựữửỳýỵỹỷđ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    let relevantChunks = 0;
    for (const content of retrievedContents) {
        const contentLower = content.toLowerCase();
        const matchCount = queryKeywords.filter(kw => contentLower.includes(kw)).length;
        if (matchCount >= Math.max(1, queryKeywords.length * 0.2)) {
            relevantChunks++;
        }
    }

    const relevanceRatio = retrievedContents.length > 0
        ? relevantChunks / retrievedContents.length
        : 0;

    if (relevanceRatio < 0.3 && retrievedContents.length > 0) {
        score -= 0.2;
        reasons.push(`Chỉ ${relevantChunks}/${retrievedContents.length} chunks liên quan đến query (${(relevanceRatio * 100).toFixed(0)}%)`);
    }

    // 4. Check: response length hợp lý
    if (response.length < 20 && query.length > 30) {
        score -= 0.1;
        reasons.push('Response quá ngắn so với câu hỏi');
    }

    // Determine verdict
    let verdict: CRAGVerdict;
    if (score >= 0.7) {
        verdict = 'correct';
    } else if (score >= 0.4) {
        verdict = 'ambiguous';
        reasons.push('⚠️ Context có thể chưa đầy đủ — cân nhắc bổ sung search');
    } else {
        verdict = 'incorrect';
        reasons.push('❌ Nghi ngờ hallucination — nên retry với context rộng hơn');
    }

    return {
        verdict,
        confidence: Math.max(0, Math.min(1, score)),
        reasons,
    };
}

/**
 * Tạo warning message nhúng vào response nếu CRAG phát hiện vấn đề
 */
export function getCRAGWarning(result: CRAGResult): string | null {
    if (result.verdict === 'correct') return null;

    if (result.verdict === 'ambiguous') {
        return '\n\n> ⚠️ *Lưu ý: Một số thông tin trong câu trả lời có thể chưa hoàn toàn chính xác. Vui lòng kiểm tra lại với dữ liệu gốc.*';
    }

    return '\n\n> ⚠️ *Lưu ý: Câu trả lời này có thể chứa thông tin chưa được xác minh. Vui lòng đối chiếu với báo cáo chính thức.*';
}
