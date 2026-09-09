/**
 * 🧠 Adaptive RAG — Query Classifier
 * Phân loại độ phức tạp câu hỏi → chọn pipeline phù hợp
 * Simple → FACT SHEET only | Medium → Hybrid RAG | Complex → GraphRAG
 */

export type QueryComplexity = 'simple' | 'medium' | 'complex';

export interface ClassificationResult {
    complexity: QueryComplexity;
    reason: string;
    suggestedSourceTypes?: string[];
}

// Patterns cho câu hỏi ĐƠN GIẢN (direct lookup, không cần search)
const SIMPLE_PATTERNS = [
    /^(hôm nay|ngày mai|hôm qua).*(bao nhiêu|mấy).*(suất|người|NV)/i,
    /^(ai|NV nào).*(chưa|đã).*(đăng ký|ăn)/i,
    /^(tổng|số).*(suất|NV|nhân viên).*(hôm nay|ngày)/i,
    /^(deadline|hạn|giờ).*(đăng ký|đặt)/i,
    /^(giá|chi phí).*(suất|bữa)/i,
    /^xin chào|hello|hi$/i,
];

// Patterns cho câu hỏi PHỨC TẠP (multi-hop, cross-entity, analytical)
const COMPLEX_PATTERNS = [
    // So sánh cross-entity
    /so sánh.*(phòng|ca|nhóm|tháng)/i,
    /(phòng|ca|nhóm) nào.*(cao nhất|thấp nhất|nhiều nhất|ít nhất)/i,
    // Multi-hop reasoning
    /tại sao.*(cancel|nghỉ|tăng|giảm)/i,
    /nguyên nhân.*(lãng phí|hủy|cancel)/i,
    /xu hướng|trend|biến động/i,
    // Cross-time analysis
    /so với.*(tháng trước|tuần trước|năm)/i,
    /(3|ba|6|sáu|12|mười hai) tháng/i,
    // Nhóm NV phức tạp
    /nhóm.*NV.*(cancel|nghỉ|không ăn).*nhiều/i,
    /mối (quan hệ|liên hệ|tương quan)/i,
    // Recommendation
    /(đề xuất|gợi ý|nên|khuyên).*(menu|thực đơn|cải thiện|tối ưu)/i,
    // Global queries
    /tổng quan|overview|toàn bộ|big picture/i,
    /phân tích.*(sâu|chi tiết|toàn diện)/i,
];

// Keywords gợi ý cần tìm trong Knowledge Base
const KB_KEYWORDS = [
    'chính sách', 'policy', 'quy định', 'quy trình',
    'menu', 'thực đơn', 'món ăn', 'recipe',
    'ngân sách', 'budget', 'chi phí',
];

// Keywords gợi ý cần tìm employee/department data
const ENTITY_KEYWORDS = [
    'nhân viên', 'NV', 'phòng ban', 'phòng', 'ca ăn', 'ca',
    'nhóm', 'ai', 'người', 'bộ phận',
];

/**
 * Phân loại câu hỏi để chọn pipeline RAG phù hợp
 */
export function classifyQuery(query: string): ClassificationResult {
    const q = query.trim();

    // Check simple patterns first
    for (const pattern of SIMPLE_PATTERNS) {
        if (pattern.test(q)) {
            return {
                complexity: 'simple',
                reason: 'Direct lookup question — FACT SHEET đủ dùng',
            };
        }
    }

    // Check complex patterns
    for (const pattern of COMPLEX_PATTERNS) {
        if (pattern.test(q)) {
            // Determine source types for graph search
            const sourceTypes: string[] = [];
            if (ENTITY_KEYWORDS.some(kw => q.toLowerCase().includes(kw))) {
                sourceTypes.push('employee_profile');
            }
            if (KB_KEYWORDS.some(kw => q.toLowerCase().includes(kw))) {
                sourceTypes.push('knowledge_base');
            }

            return {
                complexity: 'complex',
                reason: 'Multi-hop / cross-entity / analytical question — cần GraphRAG',
                suggestedSourceTypes: sourceTypes.length > 0 ? sourceTypes : undefined,
            };
        }
    }

    // Default: medium (Hybrid RAG)
    const sourceTypes: string[] = [];
    if (ENTITY_KEYWORDS.some(kw => q.toLowerCase().includes(kw))) {
        sourceTypes.push('employee_profile');
    }
    if (KB_KEYWORDS.some(kw => q.toLowerCase().includes(kw))) {
        sourceTypes.push('knowledge_base');
    }
    // Always include daily summaries for meal-related queries
    if (/suất|ăn|cancel|đăng ký|order|meal/i.test(q)) {
        sourceTypes.push('daily_summary');
    }

    return {
        complexity: 'medium',
        reason: 'Standard question — Hybrid RAG (vector + keyword)',
        suggestedSourceTypes: sourceTypes.length > 0 ? sourceTypes : undefined,
    };
}
