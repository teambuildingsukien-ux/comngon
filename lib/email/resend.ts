import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendVerificationEmailParams {
    to: string;
    name: string;
    verifyLink: string;
    companyName: string;
}

export async function sendVerificationEmail({
    to,
    name,
    verifyLink,
    companyName,
}: SendVerificationEmailParams) {
    const { data, error } = await resend.emails.send({
        from: `Cơm Ngon <${process.env.RESEND_FROM_EMAIL || 'contact@vinmediaglobal.com'}>`,
        to: [to],
        subject: '📧 Xác nhận tài khoản Cơm Ngon',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f7f3ef; font-family: 'Segoe UI', Arial, sans-serif;">
    <div style="max-width:560px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%); padding:32px 40px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:28px;">🍚 Cơm Ngon</h1>
            <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">Hệ thống đặt cơm thông minh</p>
        </div>
        
        <!-- Body -->
        <div style="padding:40px;">
            <h2 style="color:#333; margin:0 0 16px; font-size:20px;">Chào mừng bạn! 🎉</h2>
            <p style="color:#555; line-height:1.6; margin:0 0 8px;">
                Xin chào <strong>${name}</strong>,
            </p>
            <p style="color:#555; line-height:1.6; margin:0 0 24px;">
                Bạn vừa đăng ký tài khoản quản trị cho tổ chức <strong>${companyName}</strong>. 
                Vui lòng click nút bên dưới để xác nhận email:
            </p>
            
            <!-- CTA Button -->
            <div style="text-align:center; margin:32px 0;">
                <a href="${verifyLink}" 
                   style="display:inline-block; background:linear-gradient(135deg, #8B4513 0%, #A0522D 100%); color:#fff; padding:16px 40px; text-decoration:none; border-radius:12px; font-size:16px; font-weight:600; letter-spacing:0.5px;">
                    ✅ Xác nhận email
                </a>
            </div>
            
            <p style="color:#888; font-size:13px; line-height:1.5; margin:24px 0 0;">
                ⏰ Link có hiệu lực trong <strong>30 phút</strong>.<br>
                📋 Sau khi xác nhận, admin hệ thống sẽ duyệt tài khoản trong vòng 24h.
            </p>
            
            <!-- Fallback link -->
            <div style="margin-top:24px; padding:16px; background:#f9f6f2; border-radius:8px;">
                <p style="color:#999; font-size:12px; margin:0 0 4px;">Nếu nút không hoạt động, copy link này:</p>
                <p style="color:#8B4513; font-size:11px; margin:0; word-break:break-all;">${verifyLink}</p>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="padding:24px 40px; background:#f9f6f2; text-align:center; border-top:1px solid #eee;">
            <p style="color:#aaa; font-size:12px; margin:0;">
                Nếu bạn không đăng ký tài khoản, vui lòng bỏ qua email này.
            </p>
        </div>
    </div>
</body>
</html>
        `,
    });

    if (error) {
        console.error('[RESEND] Send error:', error);
        throw error;
    }

    console.log('[RESEND] Email sent successfully:', data?.id, 'to:', to);
    return data;
}

// ==================== APPROVAL EMAIL ====================

interface SendApprovalEmailParams {
    to: string;
    name: string;
    companyName: string;
    loginUrl?: string;
}

/**
 * Gửi email thông báo doanh nghiệp đã được duyệt
 * Trigger: Platform owner bấm "Duyệt" trong Platform Admin
 */
export async function sendApprovalEmail({
    to,
    name,
    companyName,
    loginUrl = 'https://comngon.io.vn/login',
}: SendApprovalEmailParams) {
    const { data, error } = await resend.emails.send({
        from: `Cơm Ngon <${process.env.RESEND_FROM_EMAIL || 'contact@vinmediaglobal.com'}>`,
        to: [to],
        subject: '✅ Tài khoản đã được duyệt — Cơm Ngon',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f7f3ef; font-family: 'Segoe UI', Arial, sans-serif;">
    <div style="max-width:560px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); padding:32px 40px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:28px;">🎉 Chúc mừng!</h1>
            <p style="color:rgba(255,255,255,0.9); margin:8px 0 0; font-size:15px;">Tài khoản đã được phê duyệt</p>
        </div>
        
        <!-- Body -->
        <div style="padding:40px;">
            <p style="color:#555; line-height:1.7; margin:0 0 8px; font-size:15px;">
                Xin chào <strong>${name}</strong>,
            </p>
            <p style="color:#555; line-height:1.7; margin:0 0 16px; font-size:15px;">
                Tài khoản của tổ chức <strong style="color:#16a34a;">${companyName}</strong> đã được 
                <strong style="color:#16a34a;">phê duyệt thành công</strong> trên hệ thống Cơm Ngon! 🍚
            </p>
            
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:20px; margin:20px 0;">
                <p style="color:#166534; margin:0; font-size:14px; line-height:1.6;">
                    ✅ Bạn có thể <strong>đăng nhập ngay</strong> và bắt đầu sử dụng hệ thống.<br>
                    📅 Thời gian dùng thử: <strong>14 ngày miễn phí</strong>.<br>
                    📞 Hỗ trợ: <strong>0348 072 002</strong> (Thân Công Hải)
                </p>
            </div>
            
            <!-- CTA Button -->
            <div style="text-align:center; margin:32px 0;">
                <a href="${loginUrl}" 
                   style="display:inline-block; background:linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color:#fff; padding:16px 48px; text-decoration:none; border-radius:12px; font-size:16px; font-weight:700; letter-spacing:0.5px; box-shadow:0 4px 14px rgba(22,163,74,0.3);">
                    🚀 Đăng nhập ngay
                </a>
            </div>
            
            <p style="color:#888; font-size:13px; line-height:1.5; margin:24px 0 0;">
                Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ đội ngũ hỗ trợ.
            </p>
        </div>
        
        <!-- Footer -->
        <div style="padding:24px 40px; background:#f9f6f2; text-align:center; border-top:1px solid #eee;">
            <p style="color:#aaa; font-size:12px; margin:0;">
                © 2026 Cơm Ngon — Hệ thống đặt cơm thông minh
            </p>
        </div>
    </div>
</body>
</html>
        `,
    });

    if (error) {
        console.error('[RESEND] Approval email error:', error);
        throw error;
    }

    console.log('[RESEND] Approval email sent to:', to, '| ID:', data?.id);
    return data;
}

// ==================== NEW SIGNUP NOTIFICATION ====================

interface SendNewSignupNotificationParams {
    companyName: string;
    contactName: string;
    contactEmail: string;
    contactPhone?: string;
    employeeCount?: string;
    signupSource?: string;
}

/**
 * Gửi email thông báo cho platform owner khi có đăng ký mới
 * Gửi đến: PLATFORM_OWNER_EMAIL env var (default: tthanconghaibiin@gmail.com)
 */
export async function sendNewSignupNotification({
    companyName,
    contactName,
    contactEmail,
    contactPhone,
    employeeCount,
    signupSource,
}: SendNewSignupNotificationParams) {
    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL || 'tthanconghaibiin@gmail.com';
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    const { data, error } = await resend.emails.send({
        from: `Cơm Ngon Platform <${process.env.RESEND_FROM_EMAIL || 'contact@vinmediaglobal.com'}>`,
        to: [ownerEmail],
        subject: `🆕 Đăng ký mới: ${companyName}`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#0f172a; font-family: 'Segoe UI', Arial, sans-serif;">
    <div style="max-width:560px; margin:40px auto; background:#1e293b; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.3); border:1px solid #334155;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding:28px 40px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:22px;">🔔 Đăng ký dùng thử mới</h1>
            <p style="color:rgba(255,255,255,0.9); margin:6px 0 0; font-size:13px;">${now}</p>
        </div>
        
        <!-- Body -->
        <div style="padding:32px 40px;">
            <table style="width:100%; border-collapse:collapse;">
                <tr>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#94a3b8; font-size:13px; width:120px;">🏢 Công ty</td>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#f1f5f9; font-size:14px; font-weight:600;">${companyName}</td>
                </tr>
                <tr>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#94a3b8; font-size:13px;">👤 Người LH</td>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#f1f5f9; font-size:14px;">${contactName}</td>
                </tr>
                <tr>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#94a3b8; font-size:13px;">📧 Email</td>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#f1f5f9; font-size:14px;"><a href="mailto:${contactEmail}" style="color:#60a5fa; text-decoration:none;">${contactEmail}</a></td>
                </tr>
                ${contactPhone ? `<tr>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#94a3b8; font-size:13px;">📱 SĐT</td>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#f1f5f9; font-size:14px;">${contactPhone}</td>
                </tr>` : ''}
                ${employeeCount ? `<tr>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#94a3b8; font-size:13px;">👥 Quy mô</td>
                    <td style="padding:12px 0; border-bottom:1px solid #334155; color:#f1f5f9; font-size:14px;">${employeeCount}</td>
                </tr>` : ''}
                <tr>
                    <td style="padding:12px 0; color:#94a3b8; font-size:13px;">🌐 Nguồn</td>
                    <td style="padding:12px 0; color:#f1f5f9; font-size:14px;">${signupSource || 'Website'}</td>
                </tr>
            </table>
            
            <!-- CTA -->
            <div style="text-align:center; margin:28px 0 0;">
                <a href="https://comngon.io.vn/platform" 
                   style="display:inline-block; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color:#fff; padding:14px 36px; text-decoration:none; border-radius:10px; font-size:14px; font-weight:700; letter-spacing:0.3px;">
                    🔍 Xem trên Platform Admin
                </a>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="padding:16px 40px; background:#0f172a; text-align:center; border-top:1px solid #334155;">
            <p style="color:#64748b; font-size:11px; margin:0;">
                Cơm Ngon Platform • Thông báo tự động
            </p>
        </div>
    </div>
</body>
</html>
        `,
    });

    if (error) {
        console.error('[RESEND] Signup notification error:', error);
        throw error;
    }

    console.log('[RESEND] Signup notification sent to:', ownerEmail, '| ID:', data?.id);
    return data;
}
