/**
 * Embedding Pipeline cho Hybrid RAG
 * Sử dụng Gemini Embedding API (gemini-embedding-001, 768 dims MRL)
 */

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768; // MRL truncated từ 3072
const MAX_CHUNK_LENGTH = 2000; // chars per chunk
const OVERLAP_LENGTH = 200; // chars overlap giữa các chunks

import { decryptApiKey } from '@/lib/ai-chat/crypto';

/**
 * Resolve API key: ưu tiên tenant key → giải mã AES-256-GCM (hoặc legacy base64) → fallback global env key
 */
export function resolveApiKey(tenantKeyEncoded?: string | null): string {
    if (tenantKeyEncoded) {
        try {
            // decryptApiKey tự detect AES-256-GCM vs legacy base64
            return decryptApiKey(tenantKeyEncoded);
        } catch {
            // Decrypt failed → fallback to global key (key bị hỏng)
            console.warn('[resolveApiKey] Failed to decrypt tenant key, falling back to global key');
        }
    }
    const globalKey = process.env.GEMINI_API_KEY;
    if (!globalKey) throw new Error('GEMINI_API_KEY not configured and tenant has no key');
    return globalKey;
}


/**
 * Tạo embedding vector từ text sử dụng Gemini Embedding API
 */
export async function generateEmbedding(text: string, tenantKeyEncoded?: string | null): Promise<number[]> {
    const apiKey = resolveApiKey(tenantKeyEncoded);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text }] },
                outputDimensionality: EMBEDDING_DIMENSIONS,
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.embedding.values;
}

/**
 * Tạo batch embeddings (tối đa 100 texts/lần)
 */
export async function generateBatchEmbeddings(texts: string[], tenantKeyEncoded?: string | null): Promise<number[][]> {
    const apiKey = resolveApiKey(tenantKeyEncoded);

    const requests = texts.map(text => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
    }));

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Batch Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.embeddings.map((e: { values: number[] }) => e.values);
}

/**
 * Chia text thành chunks với overlap
 */
export function chunkText(text: string, maxLength = MAX_CHUNK_LENGTH, overlap = OVERLAP_LENGTH): string[] {
    const trimmed = text.trim();
    if (trimmed.length <= 10) return []; // Quá ngắn, không có giá trị
    if (trimmed.length <= maxLength) return [trimmed];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        let end = start + maxLength;

        // Tìm điểm cắt tự nhiên (cuối câu hoặc cuối dòng)
        if (end < text.length) {
            const lastNewline = text.lastIndexOf('\n', end);
            const lastPeriod = text.lastIndexOf('. ', end);
            const breakPoint = Math.max(lastNewline, lastPeriod);

            if (breakPoint > start + maxLength * 0.5) {
                end = breakPoint + 1;
            }
        }

        chunks.push(text.slice(start, Math.min(end, text.length)).trim());
        start = end - overlap;

        if (start >= text.length) break;
    }

    return chunks.filter(c => c.length > 10); // Loại chunks quá ngắn
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
