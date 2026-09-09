/**
 * Chuyển đổi email của nhân viên đã nghỉ sang định dạng lưu trữ (archived)
 * Định dạng: resigned.{username}.{YYYYMMDDHHMMSS}@{domain}
 * Nhờ có phần timestamp giây, email này đảm bảo tính duy nhất 100%.
 */
export function getArchivedEmail(originalEmail: string): string {
    if (!originalEmail || !originalEmail.includes('@')) {
        // Dự phòng trường hợp email không hợp lệ
        const randomStr = Math.random().toString(36).substring(2, 7);
        return `resigned.${randomStr}.${Date.now()}@vietvisiontravel.com`;
    }

    const [username, domain] = originalEmail.split('@');

    // Nếu email đã có dạng resigned rồi thì không cần áp dụng thêm tiền tố nữa
    if (username.toLowerCase().startsWith('resigned.')) {
        return originalEmail;
    }

    // Lấy timestamp YYYYMMDDHHMMSS theo múi giờ Việt Nam
    const now = new Date();
    // Chuyển sang GMT+7
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const yyyy = vnTime.getUTCFullYear();
    const mm = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(vnTime.getUTCDate()).padStart(2, '0');
    const hh = String(vnTime.getUTCHours()).padStart(2, '0');
    const min = String(vnTime.getUTCMinutes()).padStart(2, '0');
    const ss = String(vnTime.getUTCSeconds()).padStart(2, '0');
    
    const timestamp = `${yyyy}${mm}${dd}${hh}${min}${ss}`;

    return `resigned.${username.toLowerCase()}.${timestamp}@${domain.toLowerCase()}`;
}
