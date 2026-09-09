'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import './landing.css';

/* ───────── Particle Canvas ───────── */
function ParticleBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Create particles
        for (let i = 0; i < 60; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                size: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.5 + 0.1,
            });
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(193, 106, 48, ${p.opacity})`;
                ctx.fill();
            });

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(193, 106, 48, ${0.06 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            animationId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return <canvas ref={canvasRef} className="particle-canvas" />;
}

/* ───────── Counter Animation ───────── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);
    const counted = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !counted.current) {
                    counted.current = true;
                    const duration = 2000;
                    const start = performance.now();
                    const step = (now: number) => {
                        const progress = Math.min((now - start) / duration, 1);
                        const eased = 1 - Math.pow(1 - progress, 3);
                        setCount(Math.floor(eased * target));
                        if (progress < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }
            },
            { threshold: 0.5 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [target]);

    return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

/* ───────── Scroll Reveal Hook ───────── */
function useReveal() {
    useEffect(() => {
        const elements = document.querySelectorAll('.reveal');
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                    }
                });
            },
            { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
        );
        elements.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);
}

/* ───────── FAQ Item ───────── */
function FAQItem({ question, answer }: { question: string; answer: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`faq-item ${open ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => setOpen(!open)}>
                {question}
                <span className="faq-icon">+</span>
            </button>
            <div className="faq-answer">
                <div className="faq-answer-content">{answer}</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════ */
const SHOWCASE_IMAGES = [
    { src: '/dashboards/admin-overview.jpg', alt: 'Cơm Ngon - Bảng điều khiển quản trị suất ăn doanh nghiệp' },
    { src: '/dashboards/employee-dashboard.jpg', alt: 'Cơm Ngon - Giao diện đăng ký suất ăn nhân viên 1-click' },
    { src: '/dashboards/kitchen-new.jpg', alt: 'Cơm Ngon - Dashboard bếp theo dõi số suất ăn real-time' },
    { src: '/dashboards/employee-list.jpg', alt: 'Cơm Ngon - Quản lý danh sách nhân viên đăng ký suất ăn' },
    { src: '/dashboards/shift-management.jpg', alt: 'Cơm Ngon - Quản lý ca ăn và nhóm phòng ban' },
    { src: '/dashboards/login-screen.jpg', alt: 'Cơm Ngon - Màn hình đăng nhập hệ thống quản lý suất ăn' },
    { src: '/dashboards/admin.jpg', alt: 'Cơm Ngon - Dashboard tổng quan chi phí và lãng phí suất ăn' },
    { src: '/dashboards/employee-new.jpg', alt: 'Cơm Ngon - Nhân viên đặt cơm online nhanh chóng' },
];

export default function LandingPage() {
    const [scrolled, setScrolled] = useState(false);
    const [showcaseSlide, setShowcaseSlide] = useState(0);
    const showcaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [isYearly, setIsYearly] = useState(false);
    const [activeRole, setActiveRole] = useState<'employee' | 'kitchen' | 'hr' | 'management'>('employee');
    const [employeeCount, setEmployeeCount] = useState(80);

    useReveal();

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Auto-slide showcase every 4s
    const resetShowcaseTimer = useCallback(() => {
        if (showcaseTimerRef.current) clearInterval(showcaseTimerRef.current);
        showcaseTimerRef.current = setInterval(() => {
            setShowcaseSlide(prev => (prev + 1) % SHOWCASE_IMAGES.length);
        }, 4000);
    }, []);

    useEffect(() => {
        resetShowcaseTimer();
        return () => { if (showcaseTimerRef.current) clearInterval(showcaseTimerRef.current); };
    }, [resetShowcaseTimer]);

    const goToSlide = (idx: number) => {
        setShowcaseSlide(idx);
        resetShowcaseTimer();
    };
    const prevSlide = () => goToSlide((showcaseSlide - 1 + SHOWCASE_IMAGES.length) % SHOWCASE_IMAGES.length);
    const nextSlide = () => goToSlide((showcaseSlide + 1) % SHOWCASE_IMAGES.length);

    return (
        <div className="landing-page">
            {/* Structured Data - Organization */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Organization",
                        "name": "Cơm Ngon SaaS",
                        "legalName": "VietVision Holdings Co., Ltd",
                        "description": "Nền tảng phần mềm quản lý suất ăn doanh nghiệp, chấm cơm tự động và vận hành bếp ăn thông minh thế hệ mới v8.3.",
                        "url": "https://comngon.io.vn",
                        "logo": "https://comngon.io.vn/logo.png",
                        "contactPoint": {
                            "@type": "ContactPoint",
                            "telephone": "+84-98-123-4567",
                            "email": "hello@comngon.io.vn",
                            "contactType": "Customer Support",
                            "areaServed": "VN",
                            "availableLanguage": ["Vietnamese", "English"]
                        },
                        "sameAs": [
                            "https://facebook.com/comngonsaas"
                        ]
                    })
                }}
            />

            {/* Structured Data - WebSite */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "WebSite",
                        "name": "Cơm Ngon",
                        "url": "https://comngon.io.vn",
                        "potentialAction": {
                            "@type": "SearchAction",
                            "target": "https://comngon.io.vn/search?q={search_term_string}",
                            "query-input": "required name=search_term_string"
                        }
                    })
                }}
            />

            {/* Structured Data - SoftwareApplication */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": "Cơm Ngon",
                        "applicationCategory": "BusinessApplication",
                        "applicationSubCategory": "HR & Kitchen Management SaaS",
                        "softwareVersion": "8.3.0",
                        "releaseDate": "2026-05-25",
                        "operatingSystem": "Web, iOS, Android, macOS, Windows",
                        "description": "Phần mềm quản lý suất ăn doanh nghiệp và chấm cơm tự động. Tích hợp Trợ lý AI Lili, quản lý ca kíp, tự động cắt cơm khi thôi việc, đồng bộ bếp ăn real-time, giảm 85% lãng phí.",
                        "url": "https://comngon.io.vn",
                        "featureList": [
                            "Đăng ký suất ăn 1-chạm PWA không cần cài app",
                            "Trợ lý AI Lili đặt cơm và tra cứu chi phí bằng giọng nói",
                            "Quản lý phân ca kíp và phòng ban linh hoạt",
                            "Tự động cắt cơm khi nhân viên thôi việc (Scheduled Resignation)",
                            "Đăng ký suất ăn khách (Guest meals)",
                            "Bảng điều khiển Bếp ăn real-time (KDS)",
                            "Xuất file Excel đối soát chấm cơm cho kế toán",
                            "Tích hợp Model Context Protocol (MCP Server)"
                        ],
                        "offers": [
                            {
                                "@type": "Offer",
                                "name": "Free",
                                "price": "0",
                                "priceCurrency": "VND",
                                "description": "Miễn phí vĩnh viễn tối đa 10 nhân viên"
                            },
                            {
                                "@type": "Offer",
                                "name": "Starter",
                                "price": "299000",
                                "priceCurrency": "VND",
                                "description": "299.000đ/tháng - Dưới 50 nhân sự"
                            },
                            {
                                "@type": "Offer",
                                "name": "Pro",
                                "price": "599000",
                                "priceCurrency": "VND",
                                "description": "599.000đ/tháng - Dưới 200 nhân sự kèm Trợ lý AI Lili"
                            }
                        ],
                        "aggregateRating": {
                            "@type": "AggregateRating",
                            "ratingValue": "4.9",
                            "ratingCount": "128",
                            "bestRating": "5",
                            "worstRating": "1"
                        }
                    })
                }}
            />

            {/* Structured Data - HowTo: Triển khai trong 3 bước */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "HowTo",
                        "name": "Cách triển khai phần mềm quản lý suất ăn doanh nghiệp Cơm Ngon trong 3 bước",
                        "description": "Hướng dẫn khởi tạo và bắt đầu sử dụng hệ thống quản lý suất ăn Cơm Ngon nhanh chóng cho công ty.",
                        "totalTime": "PT5M",
                        "step": [
                            {
                                "@type": "HowToStep",
                                "position": 1,
                                "name": "Khởi tạo tổ chức & Cấu hình ca ăn",
                                "text": "Đăng ký tài khoản Admin và cấu hình giờ chốt suất ăn (deadline) theo từng ca làm việc."
                            },
                            {
                                "@type": "HowToStep",
                                "position": 2,
                                "name": "Nhập danh sách nhân sự & Phân quyền",
                                "text": "Import danh sách nhân viên bằng file Excel hoặc chia sẻ link/mã QR để nhân viên tự đăng ký."
                            },
                            {
                                "@type": "HowToStep",
                                "position": 3,
                                "name": "Bắt đầu đặt cơm & Giám sát tức thì",
                                "text": "Nhân viên bấm chọn cơm 1-chạm, nhà bếp theo dõi số lượng real-time trên màn hình hiển thị."
                            }
                        ]
                    })
                }}
            />

            {/* Structured Data - FAQPage */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "FAQPage",
                        "mainEntity": [
                            {
                                "@type": "Question",
                                "name": "Dùng thử miễn phí 14 ngày có bị giới hạn tính năng không?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Hoàn toàn không. Bạn được trải nghiệm đầy đủ 100% tính năng của gói Pro cao cấp nhất (bao gồm cả Trợ lý AI Lili, quản lý ca kíp, báo cáo Excel và phân quyền) trong 14 ngày mà không cần nhập thẻ tín dụng."
                                }
                            },
                            {
                                "@type": "Question",
                                "name": "Dữ liệu thông tin nhân viên và công ty tôi có được bảo mật an toàn không?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Tuyệt đối an toàn. Cơm Ngon áp dụng kiến trúc Multi-Tenant chuẩn quốc tế với tính năng Row-Level Security (RLS) trên cơ sở dữ liệu PostgreSQL. Dữ liệu của từng doanh nghiệp được mã hóa và cách ly hoàn toàn, không thể bị truy cập chéo."
                                }
                            },
                            {
                                "@type": "Question",
                                "name": "Nhân viên có cần phải cài đặt app từ App Store / Google Play không?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Không cần thiết! Cơm Ngon là ứng dụng Progressive Web App (PWA) hiện đại, hoạt động mượt mà trên mọi trình duyệt điện thoại (iOS, Android) và máy tính. Nhân viên chỉ cần mở liên kết hoặc quét mã QR là có thể sử dụng ngay."
                                }
                            },
                            {
                                "@type": "Question",
                                "name": "Tính năng tự động cắt cơm khi nhân viên thôi việc hoạt động ra sao?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Khi phòng Nhân sự thiết lập ngày nghỉ việc tương lai (Scheduled Resignation Date) cho nhân viên, hệ thống sẽ tự động dừng cho phép đặt cơm và hủy toàn bộ các suất ăn đã đăng ký sau ngày đó, tránh việc bếp nấu thừa lãng phí."
                                }
                            },
                            {
                                "@type": "Question",
                                "name": "Công ty có nhiều ca kíp (ca ngày, ca đêm) và suất ăn khách có dùng được không?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Có! Cơm Ngon hỗ trợ tạo nhiều ca ăn linh hoạt trong ngày và tính năng 'Đăng ký cơm khách' cho phép nhân viên báo trước số lượng khách họp để bếp chuẩn bị chu đáo."
                                }
                            },
                            {
                                "@type": "Question",
                                "name": "Làm thế nào để kế toán đối soát tiền ăn vào cuối tháng?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Chỉ với 1 cú nhấp chuột, quản lý có thể xuất toàn bộ bảng chấm cơm chi tiết ra file Excel theo ngày, theo nhân viên hoặc theo phòng ban. Báo cáo sử dụng thuật toán đếm đồng nhất (Shared Report Calculator) đảm bảo số liệu giữa Bếp và HR khớp 100%."
                                }
                            },
                            {
                                "@type": "Question",
                                "name": "Hình thức thanh toán phí dịch vụ phần mềm như thế nào?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Hệ thống tích hợp thanh toán tự động qua mã VietQR. Bạn chỉ cần quét mã ngân hàng nội địa, tài khoản tổ chức sẽ được tự động kích hoạt ngay lập tức trong vòng 30 giây."
                                }
                            },
                            {
                                "@type": "Question",
                                "name": "Hệ thống có hỗ trợ kết nối API hoặc AI nội bộ doanh nghiệp không?",
                                "acceptedAnswer": {
                                    "@type": "Answer",
                                    "text": "Có! Phiên bản Enterprise cung cấp đầy đủ REST API và cổng giao tiếp Model Context Protocol (MCP Server) giúp các AI Agent của doanh nghiệp bạn (Claude, GPT, Cursor) truy vấn dữ liệu và tương tác trực tiếp."
                                }
                            }
                        ]
                    })
                }}
            />
            {/* Background Effects */}
            <ParticleBackground />
            <div className="gradient-orbs">
                <div className="orb orb-1" />
                <div className="orb orb-2" />
                <div className="orb orb-3" />
            </div>

            {/* ── Navigation ── */}
            <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
                <Link href="/" className="nav-logo">
                    <img src="/logo.png" alt="Cơm Ngon Logo" className="nav-logo-icon" style={{ width: '32px', height: '32px' }} />
                    Cơm Ngon
                </Link>
                <div className="nav-links">
                    <a href="#features">Tính năng</a>
                    <a href="#pricing">Bảng giá</a>
                    <a href="#faq">FAQ</a>
                    <Link href="/docs/mcp">Tài liệu MCP</Link>
                    <Link href="/login" className="nav-cta">Đăng nhập</Link>
                </div>
            </nav>

            {/* ═══════ SECTION 1: HERO (with integrated showcase) ═══════ */}
            <section className="hero" id="hero">
                <div className="hero-content">
                    <div className="hero-badge">
                        <span className="hero-badge-dot" />
                        Đang phục vụ 500+ nhân viên mỗi ngày
                    </div>

                    <h1>
                        Quản lý suất ăn <span className="gold-text">thông minh</span> cho doanh nghiệp
                    </h1>

                    <p className="hero-description">
                        Giảm <strong>80% lãng phí</strong>. Đăng ký 1-click. Dashboard real-time. Miễn phí 14 ngày.
                    </p>

                    <div className="hero-cta-group">
                        <Link href="/signup" className="btn-primary">
                            🚀 Dùng thử miễn phí
                        </Link>
                        <a href="#features" className="btn-outline">
                            Khám phá tính năng →
                        </a>
                    </div>
                </div>

                {/* Showcase Carousel — inside hero */}
                <div className="hero-showcase-inline">
                    <div className="showcase-glow" />
                    <div className="showcase-container">
                        <div className="showcase-fan">
                            {SHOWCASE_IMAGES.map((img, i) => {
                                const total = SHOWCASE_IMAGES.length;
                                const diff = (i - showcaseSlide + total) % total;
                                let pos = 'showcase-card-hidden';
                                if (diff === 0) pos = 'showcase-card-center';
                                else if (diff === 1) pos = 'showcase-card-right';
                                else if (diff === total - 1) pos = 'showcase-card-left';
                                else if (diff === 2) pos = 'showcase-card-far-right';
                                else if (diff === total - 2) pos = 'showcase-card-far-left';
                                return (
                                    <div key={i} className={`showcase-card ${pos}`} onClick={() => goToSlide(i)}>
                                        <img src={img.src} alt={img.alt} loading="lazy" />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Navigation arrows */}
                        <button className="showcase-arrow showcase-arrow-left" onClick={prevSlide} aria-label="Ảnh trước">
                            ‹
                        </button>
                        <button className="showcase-arrow showcase-arrow-right" onClick={nextSlide} aria-label="Ảnh sau">
                            ›
                        </button>

                        {/* Dots */}
                        <div className="showcase-dots">
                            {SHOWCASE_IMAGES.map((_, i) => (
                                <button key={i} className={`showcase-dot ${i === showcaseSlide ? 'active' : ''}`} onClick={() => goToSlide(i)} aria-label={`Slide ${i + 1}`} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Stats — below showcase */}
                <div className="hero-stats">
                    <div>
                        <span className="hero-stat-value"><AnimatedCounter target={15000} suffix="+" /></span>
                        <span className="hero-stat-label">Suất ăn quản lý/tháng</span>
                    </div>
                    <div>
                        <span className="hero-stat-value"><AnimatedCounter target={85} suffix="%" /></span>
                        <span className="hero-stat-label">Giảm thiểu lãng phí</span>
                    </div>
                    <div>
                        <span className="hero-stat-value">99.9%</span>
                        <span className="hero-stat-label">Uptime ổn định</span>
                    </div>
                    <div>
                        <span className="hero-stat-value">24/7</span>
                        <span className="hero-stat-label">Trợ lý AI Lili</span>
                    </div>
                </div>
            </section>

            {/* ═══════ SOCIAL PROOF: DOANH NGHIỆP TIN DÙNG ═══════ */}
            <div className="social-proof-strip">
                <p className="social-proof-title">Được tin cậy bởi các doanh nghiệp, nhà máy & tổ chức hàng đầu</p>
                <div className="social-proof-logos">
                    <div className="social-proof-item">
                        <span className="social-proof-icon">✈️</span>
                        <span>VietVision Travel</span>
                    </div>
                    <div className="social-proof-item">
                        <span className="social-proof-icon">🏭</span>
                        <span>Phú Mỹ Industrial Corp</span>
                    </div>
                    <div className="social-proof-item">
                        <span className="social-proof-icon">🏗️</span>
                        <span>Hoàng Long Construction</span>
                    </div>
                    <div className="social-proof-item">
                        <span className="social-proof-icon">💻</span>
                        <span>FPT Software Campus</span>
                    </div>
                    <div className="social-proof-item">
                        <span className="social-proof-icon">🏥</span>
                        <span>Bệnh Viện Đa Khoa Quốc Tế</span>
                    </div>
                    <div className="social-proof-item">
                        <span className="social-proof-icon">📦</span>
                        <span>Tân Á Đại Thành Logistics</span>
                    </div>
                </div>
            </div>

            {/* ═══════ SECTION 2: VẤN ĐỀ & BẢNG SO SÁNH TRƯỚC/SAU ═══════ */}
            <section className="landing-section" id="comparison">
                <div className="reveal" style={{ textAlign: 'center' }}>
                    <span className="section-badge">BÀI TOÁN LÃNG PHÍ BẾP ĂN</span>
                    <h2 className="section-title" style={{ maxWidth: 780, margin: '0 auto 16px' }}>
                        Tại sao phương pháp quản lý cơm trưa truyền thống làm bạn thất thoát hàng chục triệu mỗi tháng?
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto' }}>
                        Hơn 80% doanh nghiệp thừa nhận việc kiểm đếm suất ăn bằng tin nhắn Zalo, Google Sheet hoặc ghi sổ tay gây ra sai lệch số lượng khổng lồ.
                    </p>
                </div>

                <div className="comparison-container reveal">
                    {/* Cách làm cũ */}
                    <div className="comparison-card bad">
                        <div className="comparison-header">
                            <div className="comparison-badge-icon">✕</div>
                            <div>
                                <h3 className="comparison-title">Cách quản lý thủ công (Zalo / Excel)</h3>
                                <p style={{ fontSize: '13px', color: '#fca5a5', margin: '4px 0 0' }}>Tốn kém, thiếu minh bạch, dễ thất thoát</p>
                            </div>
                        </div>
                        <ul className="comparison-list">
                            <li>
                                <span className="comparison-icon">✕</span>
                                <div>
                                    <strong>Nấu thừa 15–20% suất ăn:</strong> Nhân viên nghỉ đột xuất hoặc đi công tác không báo kịp, bếp vẫn nấu thừa hàng chục suất mỗi ngày.
                                </div>
                            </li>
                            <li>
                                <span className="comparison-icon">✕</span>
                                <div>
                                    <strong>Mất 45–60 phút mỗi ngày:</strong> Nhân sự HR và Quản lý bếp phải đếm tay từng tin nhắn Zalo, tổng hợp bảng tính dễ nhầm lẫn.
                                </div>
                            </li>
                            <li>
                                <span className="comparison-icon">✕</span>
                                <div>
                                    <strong>Đối soát hóa đơn căng thẳng:</strong> Cuối tháng kế toán mất 2–3 ngày cãi vã số liệu giữa danh sách chấm cơm và hóa đơn tiếp phẩm.
                                </div>
                            </li>
                            <li>
                                <span className="comparison-icon">✕</span>
                                <div>
                                    <strong>Không quản lý được nhân sự thôi việc:</strong> Nhân viên đã nghỉ việc nhưng vẫn có tên trong danh sách đặt cơm gây lãng phí ngân sách.
                                </div>
                            </li>
                        </ul>
                    </div>

                    {/* Với Cơm Ngon v8.3 */}
                    <div className="comparison-card good">
                        <div className="comparison-header">
                            <div className="comparison-badge-icon">✓</div>
                            <div>
                                <h3 className="comparison-title">Với Hệ thống Cơm Ngon v8.3 (2026)</h3>
                                <p style={{ fontSize: '13px', color: '#fde68a', margin: '4px 0 0' }}>Tự động hóa 100%, chính xác thời gian thực</p>
                            </div>
                        </div>
                        <ul className="comparison-list">
                            <li>
                                <span className="comparison-icon">✓</span>
                                <div>
                                    <strong>Cắt giảm 85% suất ăn thừa:</strong> Hệ thống tự động khóa sổ đúng deadline, cập nhật số liệu thời gian thực (Real-time) cho bếp.
                                </div>
                            </li>
                            <li>
                                <span className="comparison-icon">✓</span>
                                <div>
                                    <strong>Đăng ký 1-chạm (1-Click PWA):</strong> Nhân viên đặt cơm qua điện thoại trong 3 giây, không cần cài đặt phần mềm nặng máy.
                                </div>
                            </li>
                            <li>
                                <span className="comparison-icon">✓</span>
                                <div>
                                    <strong>Xuất báo cáo Excel trong 5 giây:</strong> Thuật toán đồng bộ Bếp ≡ Admin (Shared Report Calculator) đảm bảo số liệu khớp 100%.
                                </div>
                            </li>
                            <li>
                                <span className="comparison-icon">✓</span>
                                <div>
                                    <strong>Tự động cắt cơm khi thôi việc (Scheduled Resignation):</strong> Thiết lập ngày nghỉ việc, hệ thống tự động hủy suất tương lai và hoàn ngân sách.
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 3: 4 TRỤ CỘT TÍNH NĂNG V8.3 ═══════ */}
            <section className="landing-section" id="features">
                <div className="reveal" style={{ textAlign: 'center' }}>
                    <span className="section-badge">HỆ SINH THÁI TOÀN DIỆN</span>
                    <h2 className="section-title" style={{ maxWidth: 750, margin: '0 auto 16px' }}>
                        4 Trụ cột tính năng thông minh giúp tối ưu vận hành suất ăn
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto' }}>
                        Không chỉ là phần mềm đặt cơm, Cơm Ngon v8.3 là nền tảng quản trị dinh dưỡng và chi phí hoàn chỉnh cho doanh nghiệp hiện đại.
                    </p>
                </div>

                <div className="pillars-grid">
                    {/* Trụ cột 1 */}
                    <div className="pillar-card reveal reveal-delay-1">
                        <div className="pillar-icon-box">⚡</div>
                        <h3>Đặt Cơm 1-Chạm & Trải Nghiệm Nhân Viên</h3>
                        <p className="pillar-desc">
                            Giao diện web di động (PWA) cực nhanh, thân thiện giúp nhân viên đăng ký chỉ trong 3 giây.
                        </p>
                        <ul className="pillar-bullets">
                            <li>Đăng ký/hủy suất ăn 1-click không cần cài app</li>
                            <li>Đăng ký lịch ăn cả tuần hoặc cả tháng (Calendar view)</li>
                            <li>Chế độ Báo cơm muộn (Late Registration) linh hoạt</li>
                            <li>Đăng ký suất ăn khách (Guest meals) cho đối tác</li>
                        </ul>
                    </div>

                    {/* Trụ cột 2 */}
                    <div className="pillar-card reveal reveal-delay-2">
                        <div className="pillar-icon-box">🍳</div>
                        <h3>Vận Hành Bếp Ăn Real-time (KDS)</h3>
                        <p className="pillar-desc">
                            Màn hình hiển thị bếp ăn trực tiếp giúp đầu bếp nắm bắt chính xác số lượng từng ca và món ăn.
                        </p>
                        <ul className="pillar-bullets">
                            <li>Đồng bộ số suất tức thời giữa Bếp và Nhân sự HR</li>
                            <li>Phân loại suất ăn theo ca làm việc (Ca trưa, ca tối, ca đêm)</li>
                            <li>Cảnh báo tự động trước giờ chốt nguyên liệu (Deadline Alert)</li>
                            <li>Kiểm soát định lượng và hạn chế tối đa thức ăn thừa</li>
                        </ul>
                    </div>

                    {/* Trụ cột 3 */}
                    <div className="pillar-card reveal reveal-delay-3">
                        <div className="pillar-icon-box">👥</div>
                        <h3>Nhân Sự & Phân Ca Kíp Thông Minh</h3>
                        <p className="pillar-desc">
                            Quản lý toàn bộ cơ cấu nhân sự, phòng ban và chính sách ăn trưa của công ty một cách tự động.
                        </p>
                        <ul className="pillar-bullets">
                            <li>Tự động hủy suất khi nhân viên nghỉ việc (Scheduled Resignation)</li>
                            <li>Quản lý danh sách nhân sự theo phòng ban, chi nhánh</li>
                            <li>Import & Export danh sách nhân viên bằng file Excel siêu tốc</li>
                            <li>Hỗ trợ phân quyền chặt chẽ (Admin, HR Manager, Bếp, Nhân viên)</li>
                        </ul>
                    </div>

                    {/* Trụ cột 4 */}
                    <div className="pillar-card reveal reveal-delay-4">
                        <div className="pillar-icon-box">📊</div>
                        <h3>Báo Cáo Kế Toán & Kiểm Toán Hệ Thống</h3>
                        <p className="pillar-desc">
                            Minh bạch mọi chi phí ăn trưa, lưu vết nhật ký kiểm toán và xuất báo cáo đối soát chuẩn xác.
                        </p>
                        <ul className="pillar-bullets">
                            <li>Nhật ký kiểm toán hệ thống (System Audit Log) chống gian lận</li>
                            <li>Biểu đồ so sánh chi phí theo tuần/tháng (Weekly Analytics)</li>
                            <li>Xuất file Excel bảng chấm cơm phục vụ tính lương kế toán</li>
                            <li>Thanh toán tự động qua VietQR & kích hoạt tài khoản tức thì</li>
                        </ul>
                    </div>
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 4: TRỢ LÝ AI LILI & CÔNG NGHỆ 2026 ═══════ */}
            <section className="landing-section" id="ai-assistant">
                <div className="ai-spotlight reveal">
                    <div className="ai-spotlight-content">
                        <span className="section-badge">TIÊN PHONG 2026 • AI MULTI-AGENT</span>
                        <h3>Gặp gỡ Trợ lý AI Lili — Đặt cơm và tra cứu chi phí bằng giọng nói & câu lệnh tự nhiên</h3>
                        <p>
                            Được trang bị kiến trúc Đa tác nhân (Multi-Agent) và thuật toán chống ảo giác CRAG (Corrective RAG), Trợ lý AI Lili giúp việc quản lý suất ăn trở nên nhàn nhã hơn bao giờ hết.
                        </p>

                        <div className="ai-features-grid">
                            <div className="ai-feature-pill">
                                <span>🎙️</span>
                                <span>Đặt cơm bằng ngôn ngữ tự nhiên tiếng Việt</span>
                            </div>
                            <div className="ai-feature-pill">
                                <span>🛡️</span>
                                <span>Kiểm soát an toàn với AI Audit Dashboard</span>
                            </div>
                            <div className="ai-feature-pill">
                                <span>⚡</span>
                                <span>Card xác nhận trực quan (Inline Edit Preview)</span>
                            </div>
                            <div className="ai-feature-pill">
                                <span>🔒</span>
                                <span>Bảo mật dữ liệu Multi-Tenant với PostgreSQL RLS</span>
                            </div>
                        </div>
                    </div>

                    {/* Mockup chat Lili */}
                    <div className="ai-chat-mockup">
                        <div className="ai-chat-header">
                            <img src="/lili-avatar.png" alt="Lili AI Assistant" className="ai-chat-avatar" />
                            <div>
                                <div className="ai-chat-title">Trợ lý ảo Lili</div>
                                <div className="ai-chat-status">Sẵn sàng hỗ trợ 24/7</div>
                            </div>
                        </div>

                        <div className="ai-msg user">
                            &quot;Lili ơi, mai team Marketing có thêm 2 khách họp trưa, cộng với anh Hải ăn ca trưa nhé!&quot;
                        </div>

                        <div className="ai-msg bot">
                            Dạ em đã hiểu lệnh! Em xin gửi đề xuất cập nhật để Quản lý duyệt:
                            <div className="ai-action-confirm">
                                <div className="ai-action-confirm-row">
                                    <span>Ngày ăn:</span>
                                    <strong>Ngày mai (Thứ Sáu)</strong>
                                </div>
                                <div className="ai-action-confirm-row">
                                    <span>Nhân viên:</span>
                                    <strong>Nguyễn Văn Hải (MKT)</strong>
                                </div>
                                <div className="ai-action-confirm-row">
                                    <span>Cơm khách:</span>
                                    <strong>+2 Suất trưa</strong>
                                </div>
                                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                    <span style={{ background: '#22c55e', color: '#000', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>✓ Xác nhận</span>
                                    <span style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px' }}>✎ Sửa nhanh</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Banner Model Context Protocol (MCP Server) */}
                <div className="mcp-banner reveal">
                    <div className="mcp-banner-text">
                        <h4>
                            <span>🔌</span>
                            Tích hợp Model Context Protocol (MCP Server)
                            <span className="mcp-banner-badge">CHUẨN 2026</span>
                        </h4>
                        <p>
                            Cơm Ngon cung cấp cổng MCP Server chính thức giúp các mô hình AI doanh nghiệp (Claude, ChatGPT, Cursor) kết nối trực tiếp để truy vấn số liệu suất ăn và đặt cơm tự động qua API.
                        </p>
                    </div>
                    <Link href="/docs/mcp" className="btn-outline" style={{ whiteSpace: 'nowrap' }}>
                        Xem tài liệu MCP →
                    </Link>
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 5: GIẢI PHÁP MAY ĐO CHO TỪNG BỘ PHẬN ═══════ */}
            <section className="landing-section" id="solutions">
                <div className="reveal" style={{ textAlign: 'center' }}>
                    <span className="section-badge">GIẢI PHÁP THEO VAI TRÒ</span>
                    <h2 className="section-title" style={{ maxWidth: 700, margin: '0 auto 16px' }}>
                        Tối ưu trải nghiệm cho mọi thành viên trong doanh nghiệp
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto' }}>
                        Dù bạn là nhân viên, bếp ăn, quản lý nhân sự hay giám đốc tài chính, Cơm Ngon đều có công cụ chuyên biệt dành cho bạn.
                    </p>
                </div>

                <div className="role-tabs-wrapper reveal">
                    {/* Navigation Buttons */}
                    <div className="role-tabs-nav">
                        {[
                            { id: 'employee', label: '📱 Nhân Viên (Employee)' },
                            { id: 'kitchen', label: '🍳 Bếp Ăn (Kitchen)' },
                            { id: 'hr', label: '👥 Quản Lý Nhân Sự (HR)' },
                            { id: 'management', label: '📊 Ban Giám Đốc (CFO/CEO)' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                className={`role-tab-btn ${activeRole === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveRole(tab.id as 'employee' | 'kitchen' | 'hr' | 'management')}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab 1: Nhân viên */}
                    {activeRole === 'employee' && (
                        <div className="role-tab-content">
                            <div className="role-tab-text">
                                <h3>Trải nghiệm đặt cơm 1-chạm không thể tiện hơn</h3>
                                <p>
                                    Nhân viên không cần tải ứng dụng phức tạp. Chỉ cần mở link web trên điện thoại (PWA), họ có thể theo dõi thực đơn, chọn món và đăng ký ăn chỉ với một cú chạm.
                                </p>
                                <ul className="role-benefits-list">
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Đăng ký & hủy trong 3 giây:</strong> Chủ động báo nghỉ khi đi công tác, không sợ quên.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Lịch ăn theo tháng trực quan:</strong> Đặt trước lịch ăn cho cả tuần hoặc cả tháng thuận tiện.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Thông báo nhắc nhở tự động:</strong> Nhận tin nhắn nhắc báo cơm trước khi hết giờ chốt.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Hỗ trợ đăng ký cơm khách:</strong> Báo trước số lượng khách đến ăn trưa cùng phòng ban.</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="role-tab-preview">
                                <img src="/dashboards/employee-dashboard.jpg" alt="Giao diện đặt cơm nhân viên Cơm Ngon" loading="lazy" />
                            </div>
                        </div>
                    )}

                    {/* Tab 2: Bếp ăn */}
                    {activeRole === 'kitchen' && (
                        <div className="role-tab-content">
                            <div className="role-tab-text">
                                <h3>Nắm bắt số suất nấu chính xác đến từng phần</h3>
                                <p>
                                    Đầu bếp và nhân viên tiếp phẩm theo dõi bảng điều khiển bếp (Kitchen Display) cập nhật từng phút. Chấm dứt vĩnh viễn cảnh đoán mò số lượng hoặc thừa hàng chục suất cơm.
                                </p>
                                <ul className="role-benefits-list">
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Bảng chốt số tự động tại deadline:</strong> Bếp biết chính xác lượng gạo, thịt, rau cần nấu.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Phân loại theo ca làm việc:</strong> Tách biệt rõ ràng suất ăn ca trưa, ca tối hoặc ca đêm.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Đồng bộ Bếp ≡ Admin:</strong> Đảm bảo số lượng suất ăn nhà bếp chế biến khớp 100% với báo cáo công ty.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Giao diện Dark Mode tối ưu:</strong> Dễ dàng quan sát từ xa ngay trên máy tính bảng gắn tại bếp.</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="role-tab-preview">
                                <img src="/dashboards/kitchen-new.jpg" alt="Màn hình hiển thị bếp ăn trực tiếp Cơm Ngon" loading="lazy" />
                            </div>
                        </div>
                    )}

                    {/* Tab 3: HR */}
                    {activeRole === 'hr' && (
                        <div className="role-tab-content">
                            <div className="role-tab-text">
                                <h3>Giải phóng phòng Nhân sự khỏi đống sổ sách chấm cơm</h3>
                                <p>
                                    Không còn cảnh nhắn tin réo gọi nhân viên từng ngày hay cặm cụi gõ Excel cuối tháng. Tất cả được tự động hóa từ phân ca, quản lý thôi việc đến xuất file chấm cơm.
                                </p>
                                <ul className="role-benefits-list">
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Tự động cắt cơm khi thôi việc (Scheduled Resignation):</strong> Lên lịch ngày nghỉ việc, hệ thống tự hủy suất ăn.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Quản lý cơ cấu phòng ban & ca kíp:</strong> Phân nhóm linh hoạt theo sơ đồ tổ chức công ty.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Xuất bảng chấm cơm Excel 1-chạm:</strong> Bảng tính đầy đủ chi tiết từng nhân viên phục vụ kế toán tính lương.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Import danh sách nhân viên siêu tốc:</strong> Thêm 500 nhân sự chỉ với 1 file Excel mẫu.</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="role-tab-preview">
                                <img src="/dashboards/shift-management.jpg" alt="Quản lý ca kíp và nhân sự Cơm Ngon" loading="lazy" />
                            </div>
                        </div>
                    )}

                    {/* Tab 4: Ban Giám Đốc */}
                    {activeRole === 'management' && (
                        <div className="role-tab-content">
                            <div className="role-tab-text">
                                <h3>Kiểm soát ngân sách phúc lợi & Minh bạch tài chính</h3>
                                <p>
                                    Cung cấp góc nhìn bao quát và số liệu chính xác theo thời gian thực giúp Ban Giám đốc và CFO dễ dàng ra quyết định tối ưu hóa chi phí vận hành.
                                </p>
                                <ul className="role-benefits-list">
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Báo cáo chi phí trực tiếp (Live Cost & Waste Analytics):</strong> Nắm rõ từng đồng ngân sách chi cho bữa ăn.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Nhật ký kiểm toán hệ thống (System Audit Log):</strong> Giám sát mọi thay đổi, ngăn ngừa gian lận suất ăn.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Cắt giảm trung bình 15–20% chi phí ăn trưa:</strong> Thu hồi vốn đầu tư (ROI) ngay trong tháng đầu tiên.</span>
                                    </li>
                                    <li>
                                        <span className="bullet-check">✓</span>
                                        <span><strong>Cam kết an toàn dữ liệu Enterprise:</strong> Kiến trúc Multi-tenant RLS và bảo mật chuẩn doanh nghiệp.</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="role-tab-preview">
                                <img src="/dashboards/admin-overview.jpg" alt="Dashboard quản trị chi phí và lãng phí Cơm Ngon" loading="lazy" />
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 6: MÁY TÍNH TIẾT KIỆM CHI PHÍ (ROI CALCULATOR) ═══════ */}
            <section className="landing-section" id="roi-calculator">
                <div className="reveal" style={{ textAlign: 'center' }}>
                    <span className="section-badge">TÍNH TOÁN HIỆU QUẢ ĐẦU TƯ</span>
                    <h2 className="section-title" style={{ maxWidth: 700, margin: '0 auto 16px' }}>
                        Doanh nghiệp bạn sẽ tiết kiệm được bao nhiêu với Cơm Ngon?
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto' }}>
                        Kéo thanh trượt để tính toán số tiền lãng phí và số giờ làm việc tiết kiệm được mỗi tháng dựa trên quy mô nhân sự của bạn.
                    </p>
                </div>

                <div className="roi-calculator-box reveal">
                    <div className="roi-slider-group">
                        <div className="roi-slider-label">
                            <span>Quy mô nhân sự công ty bạn:</span>
                            <span className="roi-slider-value">{employeeCount} nhân viên</span>
                        </div>
                        <input
                            type="range"
                            min="15"
                            max="500"
                            step="5"
                            value={employeeCount}
                            onChange={(e) => setEmployeeCount(Number(e.target.value))}
                            className="roi-range-input"
                            aria-label="Số lượng nhân viên"
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <span>15 nhân viên</span>
                            <span>250 nhân viên</span>
                            <span>500+ nhân viên</span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 0' }}>
                            * Giả định: Suất ăn tiêu chuẩn 35.000 VNĐ/suất, 22 ngày làm việc/tháng, tỷ lệ thất thoát truyền thống 16%.
                        </p>
                    </div>

                    <div className="roi-results-grid">
                        <div className="roi-stat-card featured">
                            <div className="roi-stat-number">
                                ~{Math.round((employeeCount * 35000 * 22 * 0.16) / 1000000).toLocaleString('vi-VN')} Triệu VNĐ
                            </div>
                            <div className="roi-stat-label">Số tiền lãng phí cắt giảm được mỗi tháng</div>
                        </div>
                        <div className="roi-stat-card">
                            <div className="roi-stat-number" style={{ color: 'var(--gold-light)' }}>
                                ~{Math.round(employeeCount * 0.35)} giờ
                            </div>
                            <div className="roi-stat-label">Thời gian HR & Bếp tiết kiệm được mỗi tháng</div>
                        </div>
                        <div className="roi-stat-card">
                            <div className="roi-stat-number" style={{ color: '#22c55e' }}>
                                85%
                            </div>
                            <div className="roi-stat-label">Giảm thiểu sai lệch suất ăn ngay tuần đầu</div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 7: QUY TRÌNH 3 BƯỚC TRIỂN KHAI ═══════ */}
            <section className="landing-section" id="how-it-works">
                <div className="reveal" style={{ textAlign: 'center' }}>
                    <span className="section-badge">TRIỂN KHAI NHANH CHÓNG</span>
                    <h2 className="section-title" style={{ maxWidth: 650, margin: '0 auto 16px' }}>
                        Bắt đầu vận hành chỉ trong 3 bước đơn giản
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto' }}>
                        Không cần cài đặt máy chủ, không cần chuyên viên IT. Hệ thống sẵn sàng sử dụng chỉ sau 5 phút.
                    </p>
                </div>

                <div className="steps-container">
                    {[
                        {
                            num: '01',
                            title: 'Khởi tạo tổ chức & Cấu hình ca ăn',
                            desc: 'Đăng ký tài khoản Admin, đặt tên doanh nghiệp và thiết lập giờ chốt suất ăn (Deadline) theo ca làm việc của công ty bạn.',
                        },
                        {
                            num: '02',
                            title: 'Nhập danh sách nhân sự & Phân quyền',
                            desc: 'Tải danh sách nhân viên từ file Excel hoặc chia sẻ mã QR/link mời. Phân quyền cụ thể cho HR, Đầu bếp và Nhân viên.',
                        },
                        {
                            num: '03',
                            title: 'Bắt đầu đặt cơm & Giám sát tức thì',
                            desc: 'Nhân viên chọn món bằng 1-chạm. Nhà bếp theo dõi số lượng real-time trên màn hình. Kế toán tải báo cáo đối soát bất cứ lúc nào.',
                        },
                    ].map((s, i) => (
                        <div key={i} className={`step-card reveal reveal-delay-${i + 1}`}>
                            <div className="step-number">{s.num}</div>
                            <h3>{s.title}</h3>
                            <p>{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 8: KHÁCH HÀNG & ĐÁNH GIÁ ═══════ */}
            <section className="landing-section-full customers-section" id="customers">
                <div className="landing-section">
                    <div className="reveal" style={{ textAlign: 'center' }}>
                        <span className="section-badge">ĐÁNH GIÁ THỰC TẾ</span>
                        <h2 className="section-title" style={{ maxWidth: 700, margin: '0 auto 16px' }}>
                            Khách hàng nói gì sau khi sử dụng Cơm Ngon?
                        </h2>
                        <p className="section-subtitle" style={{ margin: '0 auto' }}>
                            Lắng nghe phản hồi từ những người trực tiếp vận hành tại các công ty và nhà máy hàng đầu.
                        </p>
                    </div>

                    <div className="testimonials">
                        {[
                            {
                                stars: '★★★★★',
                                text: '"Trước đây bếp chúng tôi nấu thừa 20-30 suất mỗi ngày do nhân viên đi tour bất chợt không báo kịp. Sau khi áp dụng Cơm Ngon v8.3, số suất thừa giảm về gần bằng 0. Công ty tiết kiệm hơn 16 triệu đồng mỗi tháng tiền tiếp phẩm."',
                                name: 'Nguyễn Thị Mai',
                                role: 'Quản lý Bếp ăn, VietVision Travel',
                                avatar: 'NM',
                            },
                            {
                                stars: '★★★★★',
                                text: '"Tính năng tự động cắt cơm khi nhân viên thôi việc (Scheduled Resignation) và báo cơm muộn thực sự là cứu cánh cho phòng HR. Cuối tháng chỉ cần bấm xuất Excel là có đầy đủ bảng chấm cơm gửi kế toán, không còn phải cãi vã số liệu."',
                                name: 'Trần Văn Hùng',
                                role: 'Trưởng phòng Nhân sự, Phú Mỹ Corp',
                                avatar: 'TH',
                            },
                            {
                                stars: '★★★★★',
                                text: '"Trợ lý AI Lili cực kỳ ấn tượng! Quản lý ca kíp chỉ cần gõ câu lệnh chat là hệ thống tự thêm cơm khách hoặc đổi ca cho cả nhóm. Giao diện sang trọng, tốc độ phản hồi tức thì."',
                                name: 'Lê Hoàng Anh',
                                role: 'CEO & Co-founder, Hoàng Long Group',
                                avatar: 'LA',
                            },
                        ].map((t, i) => (
                            <div key={i} className={`testimonial-card reveal reveal-delay-${i + 1}`}>
                                <div className="testimonial-stars">{t.stars}</div>
                                <p className="testimonial-text">{t.text}</p>
                                <div className="testimonial-author">
                                    <div className="testimonial-avatar">{t.avatar}</div>
                                    <div>
                                        <p className="testimonial-name">{t.name}</p>
                                        <p className="testimonial-role">{t.role}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 9: BẢNG GIÁ MINH BẠCH ═══════ */}
            <section className="landing-section" id="pricing">
                <div className="reveal" style={{ textAlign: 'center' }}>
                    <span className="section-badge">BẢNG GIÁ DỊCH VỤ</span>
                    <h2 className="section-title" style={{ maxWidth: 650, margin: '0 auto 16px' }}>
                        Gói dịch vụ linh hoạt cho mọi quy mô doanh nghiệp
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto 28px' }}>
                        Miễn phí 14 ngày trải nghiệm đầy đủ tính năng Pro. Không cần thẻ tín dụng, kích hoạt trong 30 giây.
                    </p>
                </div>

                {/* Toggle monthly/yearly */}
                <div className="flex flex-col items-center gap-3 mb-12 reveal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 shadow-inner" style={{ display: 'inline-flex' }}>
                        <button
                            onClick={() => setIsYearly(false)}
                            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${!isYearly ? 'bg-[#C16A30] text-[#0a0a0a] shadow-md border border-amber-500/20' : 'text-gray-400 hover:text-white bg-transparent border-0'}`}
                            style={{ cursor: 'pointer' }}
                        >
                            Thanh toán tháng
                        </button>
                        <button
                            onClick={() => setIsYearly(true)}
                            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-1.5 ${isYearly ? 'bg-[#C16A30] text-[#0a0a0a] shadow-md border border-amber-500/20' : 'text-gray-400 hover:text-white bg-transparent border-0'}`}
                            style={{ cursor: 'pointer' }}
                        >
                            Thanh toán năm <span className="text-[10px] bg-white/20 text-[#0a0a0a] px-2 py-0.5 rounded-full font-black">Tặng 2 tháng</span>
                        </button>
                    </div>
                </div>

                <div className="pricing-grid">
                    {/* Free */}
                    <div className="pricing-card reveal reveal-delay-1">
                        <p className="pricing-plan">Free</p>
                        <p className="pricing-price">Miễn phí</p>
                        <p className="pricing-desc">Doanh nghiệp khởi nghiệp nhỏ</p>
                        <ul className="pricing-features">
                            <li>Tối đa 10 nhân viên sử dụng</li>
                            <li>Đăng ký suất ăn 1-chạm cơ bản</li>
                            <li>Bảng đếm số lượng cho bếp</li>
                            <li className="text-gray-600 line-through" style={{ opacity: 0.4 }}>Không gồm quản lý ca kíp & phòng ban</li>
                            <li className="text-gray-600 line-through" style={{ opacity: 0.4 }}>Không xuất báo cáo Excel nâng cao</li>
                            <li className="text-gray-600 line-through" style={{ opacity: 0.4 }}>Không tích hợp Trợ lý AI Lili</li>
                        </ul>
                        <Link href="/signup" className="pricing-cta pricing-cta-outline">Bắt đầu miễn phí</Link>
                    </div>

                    {/* Starter */}
                    <div className="pricing-card reveal reveal-delay-2">
                        <p className="pricing-plan">Starter</p>
                        <p className="pricing-price">
                            {isYearly ? '2.990K' : '299K'}
                            <span style={{ fontSize: '16px', fontWeight: '400', color: 'var(--text-muted)' }}>/{isYearly ? 'năm' : 'tháng'}</span>
                        </p>
                        <p className="pricing-desc">Phù hợp đội ngũ 15–50 nhân sự</p>
                        <ul className="pricing-features">
                            <li>Tối đa 50 nhân viên</li>
                            <li>Toàn bộ tính năng gói Free +</li>
                            <li>Quản lý ca kíp & cơ cấu phòng ban</li>
                            <li>Đăng ký cơm khách (Guest meals)</li>
                            <li>Chế độ Báo cơm muộn linh hoạt</li>
                            <li>Xuất file Excel đối soát kế toán</li>
                            <li className="text-gray-600 line-through" style={{ opacity: 0.4 }}>Không tích hợp Trợ lý AI Lili</li>
                        </ul>
                        <Link href="/signup" className="pricing-cta pricing-cta-outline">Dùng thử 14 ngày</Link>
                    </div>

                    {/* Pro */}
                    <div className="pricing-card popular reveal reveal-delay-3">
                        <span className="pricing-badge">Khuyên Dùng</span>
                        <p className="pricing-plan">Pro</p>
                        <p className="pricing-price">
                            {isYearly ? '5.990K' : '599K'}
                            <span style={{ fontSize: '16px', fontWeight: '400', color: '#0a0a0a' }}>/{isYearly ? 'năm' : 'tháng'}</span>
                        </p>
                        <p className="pricing-desc">Tối ưu vận hành toàn diện</p>
                        <p className="text-xs text-[#8B3A00] font-bold mb-4 text-center" style={{ marginTop: '-12px' }}>Dành cho doanh nghiệp 50–200 nhân viên</p>
                        <ul className="pricing-features">
                            <li>Tối đa 200 nhân viên</li>
                            <li>Toàn bộ tính năng Starter +</li>
                            <li><strong>Trợ lý AI Lili:</strong> Đặt cơm bằng câu lệnh chat</li>
                            <li><strong>Tự động cắt cơm khi thôi việc (Scheduled Resignation)</strong></li>
                            <li>Báo cáo phân tích lãng phí (Live Analytics)</li>
                            <li>Nhật ký kiểm toán hệ thống (System Audit Log)</li>
                            <li>Tùy chỉnh logo & màu sắc thương hiệu công ty</li>
                        </ul>
                        <Link href="/signup" className="pricing-cta pricing-cta-primary">Dùng thử 14 ngày</Link>
                    </div>

                    {/* Enterprise */}
                    <div className="pricing-card reveal reveal-delay-4">
                        <p className="pricing-plan">Enterprise</p>
                        <p className="pricing-price">Liên hệ</p>
                        <p className="pricing-desc">Tập đoàn & Chuỗi nhà máy</p>
                        <ul className="pricing-features">
                            <li>Không giới hạn số lượng nhân viên</li>
                            <li>Quản lý nhiều chi nhánh, nhà máy, xưởng sản xuất</li>
                            <li>Tích hợp REST API & Model Context Protocol (MCP)</li>
                            <li>Kết nối phần mềm chấm công, HRM, ERP nội bộ</li>
                            <li>Hợp đồng SLA cam kết uptime 99.9%</li>
                            <li>Chuyên viên đào tạo & hỗ trợ kỹ thuật 24/7 riêng</li>
                        </ul>
                        <a href="mailto:hello@comngon.io.vn?subject=Yêu cầu tư vấn gói Enterprise - Cơm Ngon SaaS" className="pricing-cta pricing-cta-outline">Liên hệ tư vấn</a>
                    </div>
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 10: FAQ CHUẨN SEO ═══════ */}
            <section className="landing-section" id="faq">
                <div className="reveal" style={{ textAlign: 'center' }}>
                    <span className="section-badge">GIẢI ĐÁP THẮC MẮC</span>
                    <h2 className="section-title" style={{ maxWidth: 650, margin: '0 auto 16px' }}>
                        Câu hỏi thường gặp về phần mềm Cơm Ngon
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto' }}>
                        Tất cả những thông tin bạn cần biết trước khi triển khai hệ thống cho công ty của mình.
                    </p>
                </div>

                <div className="faq-list reveal">
                    <FAQItem
                        question="Dùng thử miễn phí 14 ngày có bị giới hạn tính năng không?"
                        answer="Hoàn toàn không. Bạn được trải nghiệm đầy đủ 100% tính năng của gói Pro cao cấp nhất (bao gồm cả Trợ lý AI Lili, quản lý ca kíp, báo cáo Excel và phân quyền) trong 14 ngày mà không cần nhập thẻ tín dụng."
                    />
                    <FAQItem
                        question="Dữ liệu thông tin nhân viên và công ty tôi có được bảo mật an toàn không?"
                        answer="Tuyệt đối an toàn. Cơm Ngon áp dụng kiến trúc Multi-Tenant chuẩn quốc tế với tính năng Row-Level Security (RLS) trên cơ sở dữ liệu PostgreSQL. Dữ liệu của từng doanh nghiệp được mã hóa và cách ly hoàn toàn, không thể bị truy cập chéo."
                    />
                    <FAQItem
                        question="Nhân viên có cần phải cài đặt app từ App Store / Google Play không?"
                        answer="Không cần thiết! Cơm Ngon là ứng dụng Progressive Web App (PWA) hiện đại, hoạt động mượt mà trên mọi trình duyệt điện thoại (iOS, Android) và máy tính. Nhân viên chỉ cần mở liên kết hoặc quét mã QR là có thể sử dụng ngay."
                    />
                    <FAQItem
                        question="Tính năng tự động cắt cơm khi nhân viên thôi việc hoạt động ra sao?"
                        answer="Khi phòng Nhân sự thiết lập ngày nghỉ việc tương lai (Scheduled Resignation Date) cho nhân viên, hệ thống sẽ tự động dừng cho phép đặt cơm và hủy toàn bộ các suất ăn đã đăng ký sau ngày đó, tránh việc bếp nấu thừa lãng phí."
                    />
                    <FAQItem
                        question="Công ty có nhiều ca kíp (ca ngày, ca đêm) và suất ăn khách có dùng được không?"
                        answer="Có! Cơm Ngon hỗ trợ tạo nhiều ca ăn linh hoạt trong ngày và tính năng 'Đăng ký cơm khách' cho phép nhân viên báo trước số lượng khách họp để bếp chuẩn bị chu đáo."
                    />
                    <FAQItem
                        question="Làm thế nào để kế toán đối soát tiền ăn vào cuối tháng?"
                        answer="Chỉ với 1 cú nhấp chuột, quản lý có thể xuất toàn bộ bảng chấm cơm chi tiết ra file Excel theo ngày, theo nhân viên hoặc theo phòng ban. Báo cáo sử dụng thuật toán đếm đồng nhất (Shared Report Calculator) đảm bảo số liệu giữa Bếp và HR khớp 100%."
                    />
                    <FAQItem
                        question="Hình thức thanh toán phí dịch vụ phần mềm như thế nào?"
                        answer="Hệ thống tích hợp thanh toán tự động qua mã VietQR. Bạn chỉ cần quét mã ngân hàng nội địa, tài khoản tổ chức sẽ được tự động kích hoạt ngay lập tức trong vòng 30 giây."
                    />
                    <FAQItem
                        question="Hệ thống có hỗ trợ kết nối API hoặc AI nội bộ doanh nghiệp không?"
                        answer="Có! Phiên bản Enterprise cung cấp đầy đủ REST API và cổng giao tiếp Model Context Protocol (MCP Server) giúp các AI Agent của doanh nghiệp bạn (Claude, GPT, Cursor) truy vấn dữ liệu và tương tác trực tiếp."
                    />
                </div>
            </section>

            <div className="section-divider" />

            {/* ═══════ SECTION 11: FINAL CTA ═══════ */}
            <section className="final-cta">
                <div className="final-cta-box reveal">
                    <span className="section-badge">BẮT ĐẦU TIẾT KIỆM NGAY</span>
                    <h2 className="section-title" style={{ maxWidth: 600, margin: '0 auto 16px' }}>
                        Sẵn sàng chấm dứt lãng phí suất ăn tại doanh nghiệp bạn?
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto 32px', textAlign: 'center' }}>
                        Gia nhập cùng 50+ doanh nghiệp đang tiết kiệm hàng chục triệu mỗi tháng với Cơm Ngon v8.3. Thiết lập trong 2 phút, không cần thẻ tín dụng.
                    </p>
                    <div className="hero-cta-group">
                        <Link href="/signup" className="btn-primary">
                            🚀 Tạo tài khoản dùng thử 14 ngày
                        </Link>
                        <a href="mailto:hello@comngon.io.vn?subject=Đặt lịch tư vấn & demo giải pháp Cơm Ngon" className="btn-outline">
                            Đặt lịch Demo 1-1 →
                        </a>
                    </div>
                </div>
            </section>

            {/* ═══════ SECTION 12: MEGA SAAS FOOTER ═══════ */}
            <footer className="mega-footer">
                <div className="mega-footer-inner">
                    {/* Brand column */}
                    <div className="footer-brand">
                        <h4>
                            <img src="/logo.png" alt="Cơm Ngon Logo" style={{ width: '28px', height: '28px' }} />
                            Cơm Ngon SaaS
                        </h4>
                        <p>
                            Nền tảng quản lý suất ăn doanh nghiệp & vận hành bếp ăn thông minh thế hệ mới. Cắt giảm 85% lãng phí, tự động hóa từ nhân sự đến nhà bếp.
                        </p>
                        <div className="footer-status-pill">
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                            Hệ thống hoạt động bình thường • v8.3
                        </div>
                    </div>

                    {/* Col 1: Sản phẩm */}
                    <div className="footer-col">
                        <h5>Sản phẩm</h5>
                        <ul>
                            <li><a href="#features">Tính năng toàn diện</a></li>
                            <li><a href="#ai-assistant">Trợ lý AI Lili</a></li>
                            <li><a href="#comparison">So sánh hiệu quả</a></li>
                            <li><a href="#roi-calculator">Máy tính ROI</a></li>
                            <li><a href="#pricing">Bảng giá dịch vụ</a></li>
                            <li><Link href="/docs/mcp">Tài liệu MCP Server</Link></li>
                        </ul>
                    </div>

                    {/* Col 2: Giải pháp */}
                    <div className="footer-col">
                        <h5>Giải pháp</h5>
                        <ul>
                            <li><a href="#solutions">Dành cho Nhân viên</a></li>
                            <li><a href="#solutions">Dành cho Bếp ăn</a></li>
                            <li><a href="#solutions">Dành cho Nhân sự HR</a></li>
                            <li><a href="#solutions">Dành cho Ban Giám Đốc</a></li>
                            <li><a href="#solutions">Doanh nghiệp sản xuất</a></li>
                            <li><a href="#solutions">Văn phòng công nghệ</a></li>
                        </ul>
                    </div>

                    {/* Col 3: Hỗ trợ & Liên hệ */}
                    <div className="footer-col">
                        <h5>Hỗ trợ & Liên hệ</h5>
                        <ul>
                            <li><Link href="/login">Đăng nhập hệ thống</Link></li>
                            <li><Link href="/signup">Đăng ký dùng thử</Link></li>
                            <li><a href="mailto:hello@comngon.io.vn">hello@comngon.io.vn</a></li>
                            <li><a href="tel:0981234567">Hotline: 098.123.4567</a></li>
                            <li><span>Hà Nội: VietVision Tower</span></li>
                            <li><a href="#faq">Câu hỏi thường gặp</a></li>
                        </ul>
                    </div>
                </div>

                <div className="mega-footer-bottom">
                    <span>© 2026 Cơm Ngon SaaS. Phát triển bởi VietVision Holdings. Bảo lưu mọi quyền.</span>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <a href="#" style={{ color: 'var(--text-muted)' }}>Điều khoản dịch vụ</a>
                        <a href="#" style={{ color: 'var(--text-muted)' }}>Chính sách bảo mật</a>
                        <a href="#" style={{ color: 'var(--text-muted)' }}>Tiêu chuẩn SLA</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
