/**
 * 🔄 Paginated Fetch — Bypass Supabase 1000-row default limit
 *
 * Supabase REST API trả tối đa 1000 rows mặc định.
 * Utility này tự động phân trang (pagination) bằng .range() để fetch TẤT CẢ rows.
 *
 * ⚠️ AUDIT-GUARD: Sửa logic ở đây = sửa TOÀN BỘ hệ thống fetch.
 *
 * @example
 * ```ts
 * const allOrders = await fetchAll<OrderRow>((from, to) =>
 *   supabase.from('orders')
 *     .select('date, status')
 *     .eq('tenant_id', tenantId)
 *     .gte('date', startDate)
 *     .range(from, to)
 * );
 * ```
 */

const DEFAULT_PAGE_SIZE = 1000;

/**
 * Fetch tất cả rows từ Supabase query bằng .range() pagination.
 *
 * @param buildQuery - Function nhận (from, to) trả về Supabase query đã chain .range(from, to)
 * @param pageSize - Số rows mỗi trang (mặc định 1000)
 * @returns Array chứa tất cả rows
 */
export async function fetchAll<T = any>(
    buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
    pageSize: number = DEFAULT_PAGE_SIZE
): Promise<T[]> {
    const allRows: T[] = [];
    let from = 0;

    while (true) {
        const { data, error } = await buildQuery(from, from + pageSize - 1);

        if (error) {
            console.error('[fetchAll] Pagination error at offset', from, ':', error);
            throw error;
        }

        if (!data || data.length === 0) break;

        allRows.push(...data);

        // Trang cuối: data ít hơn pageSize → không cần fetch thêm
        if (data.length < pageSize) break;

        from += pageSize;
    }

    return allRows;
}
