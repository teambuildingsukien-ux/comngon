'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAIChat } from '@/hooks/useAIChat';
import ChatActionCard from './ChatActionCard';
import ChatPendingForm from './ChatPendingForm';

// Simple markdown renderer (handles headers, bold, lists, tables, emoji)
function renderMarkdown(text: string) {
    const lines = text.split('\n');
    const html: string[] = [];
    let inTable = false;
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Close list if line is not a list item
        if (inList && !line.match(/^[\s]*[-*•]\s/) && !line.match(/^[\s]*\d+\.\s/) && line.trim() !== '') {
            html.push('</ul>');
            inList = false;
        }

        // Headers
        if (line.startsWith('#### ')) {
            html.push(`<h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 mt-3 mb-1">${line.slice(5)}</h4>`);
            continue;
        }
        if (line.startsWith('### ')) {
            html.push(`<h3 class="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4 mb-1">${line.slice(4)}</h3>`);
            continue;
        }
        if (line.startsWith('## ')) {
            html.push(`<h2 class="text-base font-extrabold text-slate-900 dark:text-white mt-4 mb-2 flex items-center gap-1.5">${line.slice(3)}</h2>`);
            continue;
        }
        if (line.startsWith('# ')) {
            html.push(`<h1 class="text-lg font-black text-slate-900 dark:text-white mt-3 mb-3">${line.slice(2)}</h1>`);
            continue;
        }

        // Table rows
        if (line.includes('|') && line.trim().startsWith('|')) {
            if (!inTable) {
                html.push('<div class="overflow-x-auto my-2"><table class="w-full text-[11px] border-collapse">');
                inTable = true;
            }
            // Skip separator rows
            if (line.match(/^\|[\s-:|]+\|$/)) continue;

            const cells = line.split('|').filter(c => c.trim() !== '');
            const isHeader = i + 1 < lines.length && lines[i + 1]?.match(/^\|[\s-:|]+\|$/);
            const tag = isHeader ? 'th' : 'td';
            const cellClass = isHeader
                ? 'px-2 py-1.5 text-left font-bold uppercase text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700'
                : 'px-2 py-1.5 text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800';
            html.push(`<tr>${cells.map(c => `<${tag} class="${cellClass}">${formatInline(c.trim())}</${tag}>`).join('')}</tr>`);
            continue;
        } else if (inTable) {
            html.push('</table></div>');
            inTable = false;
        }

        // Unordered list items
        if (line.match(/^[\s]*[-*•]\s/)) {
            if (!inList) {
                html.push('<ul class="space-y-1 my-1.5">');
                inList = true;
            }
            const content = line.replace(/^[\s]*[-*•]\s/, '');
            const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
            const ml = indent > 0 ? ' ml-3' : '';
            html.push(`<li class="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300${ml}"><span class="text-[#c04b00] mt-0.5 flex-shrink-0">•</span><span>${formatInline(content)}</span></li>`);
            continue;
        }

        // Ordered list items
        if (line.match(/^[\s]*\d+\.\s/)) {
            if (!inList) {
                html.push('<ul class="space-y-1 my-1.5">');
                inList = true;
            }
            const match = line.match(/^[\s]*(\d+)\.\s(.*)/);
            if (match) {
                html.push(`<li class="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300"><span class="text-[#c04b00] font-bold mt-0.5 flex-shrink-0 min-w-[16px]">${match[1]}.</span><span>${formatInline(match[2])}</span></li>`);
            }
            continue;
        }

        // Empty lines
        if (line.trim() === '') {
            html.push('<div class="h-1.5"></div>');
            continue;
        }

        // Horizontal rule
        if (line.match(/^---+$/)) {
            html.push('<hr class="my-3 border-slate-200 dark:border-slate-700" />');
            continue;
        }

        // Regular paragraph
        html.push(`<p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed my-0.5">${formatInline(line)}</p>`);
    }

    if (inList) html.push('</ul>');
    if (inTable) html.push('</table></div>');

    return html.join('\n');
}

function formatInline(text: string): string {
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
    // Italic
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`(.+?)`/g, '<code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px] font-mono text-[#c04b00]">$1</code>');
    return text;
}

// Icon component
const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

export default function FloatingChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [showWelcomeBubble, setShowWelcomeBubble] = useState(false);
    const popupRef = useRef<HTMLDivElement | null>(null);

    const [isMobile, setIsMobile] = useState(false);
    const [position, setPosition] = useState<{ x: number; y: number; side: 'left' | 'right' }>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('lili_chat_position');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.side === 'left' || parsed.side === 'right') {
                        return parsed as { x: number; y: number; side: 'left' | 'right' };
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
        return { x: 24, y: 24, side: 'right' };
    });

    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const dragOffset = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);

    const quickCommands = [
        { label: 'Thống kê hôm nay', icon: 'bar_chart', prompt: 'Cho tôi xem thống kê suất ăn hôm nay' },
        { label: 'Hủy cơm nhân viên', icon: 'person_remove', prompt: 'Hủy cơm cho nhân viên ' },
        { label: 'Đăng ký cơm khách', icon: 'group_add', prompt: 'Đăng ký cơm khách ngày mai 3 suất' },
        { label: 'Gửi thông báo', icon: 'campaign', prompt: 'Gửi thông báo khẩn cấp: ' },
        { label: 'Lãng phí tuần này', icon: 'warning', prompt: 'Cho tôi xem thống kê lãng phí tuần này' }
    ];

    const handleQuickCommand = (prompt: string) => {
        setChatInput(prompt);
        if (chatInputRef.current) {
            chatInputRef.current.focus();
            setTimeout(() => {
                chatInputRef.current!.selectionStart = chatInputRef.current!.selectionEnd = prompt.length;
            }, 50);
        }
    };

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleDragMove = (clientX: number, clientY: number) => {
            if (!isDragging.current) return;
            
            const deltaX = clientX - dragStart.current.x;
            const deltaY = clientY - dragStart.current.y;

            if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 6) {
                hasMoved.current = true;
            }
            
            const isRightSide = position.side === 'right';
            let newX = isRightSide 
                ? dragOffset.current.x - deltaX 
                : dragOffset.current.x + deltaX;
            let newY = dragOffset.current.y - deltaY;

            const btnWidth = 56;
            const btnHeight = 56;
            const maxX = window.innerWidth - btnWidth - 10;
            const maxY = window.innerHeight - btnHeight - 10;

            newX = Math.max(10, Math.min(newX, maxX));
            newY = Math.max(10, Math.min(newY, maxY));

            setPosition(prev => ({
                ...prev,
                x: newX,
                y: newY
            }));
        };

        const handleMouseMove = (e: MouseEvent) => {
            handleDragMove(e.clientX, e.clientY);
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        };

        const handleDragEnd = () => {
            if (!isDragging.current) return;
            isDragging.current = false;
            
            const currentBtn = document.getElementById('floating-chat-toggle-btn');
            if (currentBtn) {
                currentBtn.style.cursor = 'grab';
            }

            const currentBtnElement = document.getElementById('floating-chat-toggle-btn');
            if (currentBtnElement) {
                const rect = currentBtnElement.getBoundingClientRect();
                const centerPoint = rect.left + rect.width / 2;
                const screenCenter = window.innerWidth / 2;
                
                const newSide: 'left' | 'right' = centerPoint > screenCenter ? 'right' : 'left';
                const finalX = 24;
                const finalY = position.y;

                const newPos = { x: finalX, y: finalY, side: newSide };
                setPosition(newPos);
                localStorage.setItem('lili_chat_position', JSON.stringify(newPos));
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('mouseup', handleDragEnd);
        window.addEventListener('touchend', handleDragEnd);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [position]);

    const handleDragStart = (clientX: number, clientY: number) => {
        isDragging.current = true;
        hasMoved.current = false;
        const currentBtn = document.getElementById('floating-chat-toggle-btn');
        if (currentBtn) {
            const rect = currentBtn.getBoundingClientRect();
            dragStart.current = { x: clientX, y: clientY };
            const isRightSide = position.side === 'right';
            dragOffset.current = {
                x: isRightSide ? window.innerWidth - rect.right : rect.left,
                y: window.innerHeight - rect.bottom
            };
            currentBtn.style.cursor = 'grabbing';
        }
    };

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        handleDragStart(e.clientX, e.clientY);
        e.preventDefault();
    };

    const onTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    // Show welcome bubble after delay if not dismissed
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const dismissed = sessionStorage.getItem('lili_welcome_dismissed');
        if (dismissed !== 'true' && !isOpen) {
            const timer = setTimeout(() => {
                setShowWelcomeBubble(true);
            }, 1500);
            return () => clearTimeout(timer);
        } else {
            setShowWelcomeBubble(false);
        }
    }, [isOpen]);

    const handleDismissWelcome = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowWelcomeBubble(false);
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('lili_welcome_dismissed', 'true');
        }
    };

    const {
        chatMessages,
        chatInput,
        chatLoading,
        sessions,
        activeSessionId,
        isRecording,
        recordingTime,
        isMuted,
        activeFormValues,
        showSessions,
        setChatInput,
        setShowSessions,
        setIsMuted,
        handleChat,
        handleConfirmAction,
        handleCancelAction,
        handleSubmitForm,
        handleFormChange,
        handleCreateSession,
        handleDeleteSession,
        handleSwitchSession,
        handleClearChat,
        chatEndRef,
        chatInputRef,
        startRecording,
        stopRecording
    } = useAIChat();

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (isOpen && popupRef.current && !popupRef.current.contains(event.target as Node)) {
                // Check if clicked the toggle button
                const toggleBtn = document.getElementById('floating-chat-toggle-btn');
                if (toggleBtn && toggleBtn.contains(event.target as Node)) {
                    return;
                }
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                chatInputRef.current?.focus();
            }, 300);
        }
    }, [isOpen, chatInputRef]);

    return (
        <>
            {/* Inject keyframes animation style */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes floatPulse {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                @keyframes bubbleFloat {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-4px); }
                }
                @keyframes floatSoundWave1 {
                    0%, 100% { transform: scaleY(0.3); }
                    50% { transform: scaleY(1.4); }
                }
                @keyframes floatSoundWave2 {
                    0%, 100% { transform: scaleY(0.4); }
                    50% { transform: scaleY(1.8); }
                }
                @keyframes floatSoundWave3 {
                    0%, 100% { transform: scaleY(0.2); }
                    50% { transform: scaleY(1.2); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideLeft {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .floating-chat-shadow {
                    box-shadow: 0 24px 60px -16px rgba(0, 0, 0, 0.22), 0 8px 30px -10px rgba(0, 0, 0, 0.14);
                }
                .floating-button-shadow {
                    box-shadow: 0 12px 35px -6px rgba(178, 71, 0, 0.35), 0 6px 16px -4px rgba(178, 71, 0, 0.18);
                }
                .lili-bubble-shadow {
                    box-shadow: 0 12px 30px -6px rgba(178, 71, 0, 0.12), 0 6px 16px -4px rgba(0, 0, 0, 0.08);
                }
                .lili-bubble-glass {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(178, 71, 0, 0.2);
                }
                .dark .lili-bubble-glass {
                    background: rgba(15, 23, 42, 0.95);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(178, 71, 0, 0.15);
                }
                .lili-bubble-arrow::after {
                    content: '';
                    position: absolute;
                    bottom: -6px;
                    right: 22px;
                    width: 12px;
                    height: 12px;
                    background: rgba(255, 255, 255, 0.95);
                    transform: rotate(45deg);
                    border-right: 1px solid rgba(178, 71, 0, 0.2);
                    border-bottom: 1px solid rgba(178, 71, 0, 0.2);
                    z-index: 1;
                }
                .dark .lili-bubble-arrow::after {
                    background: rgba(15, 23, 42, 0.95);
                    border-right: 1px solid rgba(178, 71, 0, 0.15);
                    border-bottom: 1px solid rgba(178, 71, 0, 0.15);
                }
                .lili-bubble-arrow-left::after {
                    content: '';
                    position: absolute;
                    bottom: -6px;
                    left: 22px;
                    width: 12px;
                    height: 12px;
                    background: rgba(255, 255, 255, 0.95);
                    transform: rotate(45deg);
                    border-left: 1px solid rgba(178, 71, 0, 0.2);
                    border-bottom: 1px solid rgba(178, 71, 0, 0.2);
                    z-index: 1;
                }
                .dark .lili-bubble-arrow-left::after {
                    background: rgba(15, 23, 42, 0.95);
                    border-left: 1px solid rgba(178, 71, 0, 0.15);
                    border-bottom: 1px solid rgba(178, 71, 0, 0.15);
                }
                #floating-chat-toggle-btn, 
                .select-none,
                button {
                    -webkit-user-select: none !important;
                    -moz-user-select: none !important;
                    -ms-user-select: none !important;
                    user-select: none !important;
                    -webkit-tap-highlight-color: transparent !important;
                }
            `}} />

            {/* Welcome Speech Bubble */}
            {showWelcomeBubble && !isOpen && (
                <div
                    onClick={() => setIsOpen(true)}
                    className={`fixed z-[999] w-[265px] p-3.5 rounded-2xl lili-bubble-glass lili-bubble-shadow cursor-pointer animate-[fadeIn_0.35s_cubic-bezier(0.16,1,0.3,1),bubbleFloat_4s_ease-in-out_infinite] hover:scale-[1.02] hover:border-[#b24700]/30 transition-all select-none ${
                        position.side === 'right' 
                            ? 'rounded-br-sm lili-bubble-arrow' 
                            : 'rounded-bl-sm lili-bubble-arrow-left'
                    }`}
                    style={{
                        bottom: `${position.y + 68}px`,
                        [position.side === 'right' ? 'right' : 'left']: `${position.x}px`
                    }}
                >
                    {/* Close button for bubble */}
                    <button
                        onClick={handleDismissWelcome}
                        className="absolute -top-2 -right-2 w-5.5 h-5.5 rounded-full bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-rose-600 transition-colors shadow-sm cursor-pointer z-10"
                        title="Đóng thông báo"
                    >
                        <span className="material-symbols-outlined text-[11px] font-bold">close</span>
                    </button>
                    
                    <div className="flex items-start gap-2.5">
                        <img 
                            src="/lili-avatar.png" 
                            alt="Lili Avatar" 
                            className="w-8.5 h-8.5 rounded-full object-cover flex-shrink-0 border border-orange-200 dark:border-orange-950/50 shadow-sm" 
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-extrabold tracking-wide uppercase text-[#b24700]">Lili Trợ Lý AI</p>
                            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium mt-0.5">
                                Xin chào! Mình là Lili. Hãy chạm vào đây nếu bạn cần đặt cơm hoặc hỗ trợ nhé! 🍊
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Toggle Button */}
            <button
                id="floating-chat-toggle-btn"
                onClick={(e) => {
                    if (hasMoved.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    setIsOpen(!isOpen);
                }}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
                className={`z-[999] rounded-full text-white hover:scale-105 active:scale-95 transition-all duration-300 floating-button-shadow flex items-center justify-center cursor-pointer select-none border border-orange-500/20 dark:border-orange-500/10 overflow-hidden ${
                    isOpen 
                        ? 'p-4 bg-gradient-to-br from-[#b24700] to-[#e05500] hover:from-[#c04b00] hover:to-[#f06000] w-14 h-14' 
                        : 'w-14 h-14 p-0.5 bg-white dark:bg-slate-900'
                }`}
                style={{ 
                    animation: isOpen ? 'none' : 'floatPulse 3.5s ease-in-out infinite',
                    position: 'fixed',
                    bottom: `${position.y}px`,
                    [position.side === 'right' ? 'right' : 'left']: `${position.x}px`,
                    touchAction: 'none'
                }}
                title="Lili - Trợ lý AI của Cơm Ngon (🍊 Kéo thả để di chuyển)"
            >
                {isOpen ? (
                    <Icon name="close" className="text-[28px] animate-spin-once select-none" />
                ) : (
                    <div className="relative w-full h-full select-none flex items-center justify-center">
                        <img 
                            src="/lili-avatar.png" 
                            alt="Lili" 
                            className="w-full h-full object-cover select-none pointer-events-none rounded-full" 
                        />
                        {chatMessages.length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full flex items-center justify-center text-[9px] font-black text-white select-none shadow-sm animate-pulse">
                                {chatMessages.filter(m => m.role === 'user').length}
                            </span>
                        )}
                    </div>
                )}
            </button>

            {/* Chat Box Popup */}
            {isOpen && (
                <div
                    ref={popupRef}
                    className="fixed z-[999] flex flex-col rounded-3xl border border-white/20 dark:border-slate-800/80 bg-white/95 dark:bg-slate-950/92 backdrop-blur-2xl floating-chat-shadow overflow-hidden animate-[fadeIn_0.25s_cubic-bezier(0.16,1,0.3,1)] transition-all w-[calc(100vw-32px)] sm:w-[430px] h-[calc(100dvh-110px)] sm:h-[620px] max-h-[620px]"
                    style={{
                        bottom: isMobile ? '80px' : `${position.y + 68}px`,
                        left: isMobile ? '16px' : (position.side === 'right' ? 'auto' : `${position.x}px`),
                        right: isMobile ? '16px' : (position.side === 'right' ? `${position.x}px` : 'auto'),
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4.5 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white border-b-2 border-[#b24700]/10 select-none">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8.5 h-8.5 rounded-full bg-slate-900 ring-2 ring-orange-500/25 overflow-hidden flex items-center justify-center flex-shrink-0">
                                <img src="/lili-avatar.png" alt="Lili Avatar" className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h3 className="text-xs.5 font-black bg-gradient-to-r from-white via-slate-100 to-orange-200 bg-clip-text text-transparent">Lili</h3>
                                <p className="text-[9px] font-medium text-slate-400 tracking-wider">TRỢ LÝ AI ĐIỀU HÀNH 🍊</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Speech feedback mute/unmute */}
                            <button
                                onClick={() => setIsMuted(!isMuted)}
                                className={`p-1.5 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                                    isMuted 
                                        ? 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-400' 
                                        : 'bg-emerald-950/45 hover:bg-emerald-900/45 text-emerald-400 ring-1 ring-emerald-500/20'
                                }`}
                                title={isMuted ? 'Bật đọc phát âm AI' : 'Tắt đọc phát âm AI'}
                            >
                                <Icon name={isMuted ? 'volume_off' : 'volume_up'} className="text-[16px]" />
                            </button>

                            {/* Sessions Switcher Button */}
                            <button
                                onClick={() => setShowSessions(!showSessions)}
                                className={`p-1.5 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                                    showSessions 
                                        ? 'bg-purple-950/45 hover:bg-purple-900/45 text-purple-400 ring-1 ring-purple-500/20' 
                                        : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300'
                                }`}
                                title="Danh sách hội thoại"
                            >
                                <Icon name="forum" className="text-[16px]" />
                            </button>

                            {/* Clear Chat Button */}
                            {chatMessages.length > 0 && (
                                <button
                                    onClick={handleClearChat}
                                    className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/50 text-slate-300 hover:text-rose-400 ring-1 hover:ring-rose-500/30 transition-all flex items-center justify-center cursor-pointer"
                                    title="Xóa lịch sử đoạn chat này"
                                >
                                    <Icon name="delete_sweep" className="text-[16px]" />
                                </button>
                            )}

                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition-all flex items-center justify-center cursor-pointer"
                                title="Thu nhỏ"
                            >
                                <Icon name="remove" className="text-[16px]" />
                            </button>
                        </div>
                    </div>

                    {/* Chat Area & Sessions Drawer */}
                    <div className="flex-1 relative flex overflow-hidden bg-slate-50/30 dark:bg-slate-950/40">
                        {/* Messages Body */}
                        <div className="flex-1 flex flex-col overflow-y-auto px-4.5 py-4.5 space-y-4 min-h-0 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800/80">
                            {chatMessages.length === 0 && !chatLoading && (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4.5">
                                    <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-slate-900 flex items-center justify-center text-[#b24700]/70 border border-orange-100 dark:border-slate-800/60 shadow-sm animate-pulse">
                                        <Icon name="chat_bubble_outline" className="text-[28px]" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs.5 font-extrabold text-slate-800 dark:text-slate-200">Trò chuyện cùng Lili</p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[270px] leading-relaxed">
                                            Lili hỗ trợ đặt cơm, báo nghỉ, thêm cơm khách phát sinh và truy vấn thống kê nhanh chóng.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 w-full max-w-[310px] pt-1">
                                        {[
                                            'Hủy cơm cho Hương ngày mai',
                                            'Xem thống kê suất ăn hôm nay',
                                            'Đăng ký cơm khách ngày mai 3 suất',
                                        ].map(suggestion => (
                                            <button
                                                key={suggestion}
                                                onClick={() => {
                                                    setChatInput(suggestion);
                                                    chatInputRef.current?.focus();
                                                }}
                                                className="text-left px-3.5 py-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 hover:border-[#b24700]/30 hover:bg-[#b24700]/5 dark:hover:bg-[#b24700]/5 transition-all text-[11px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer"
                                            >
                                                💬 {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Chat History Messages */}
                            {chatMessages.map((msg, idx) => (
                                <div key={`${msg.role}-${msg.timestamp || idx}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.2s_ease-out]`}>
                                    <div className={`max-w-[85%] ${msg.role === 'user'
                                        ? 'bg-gradient-to-r from-[#b24700] to-[#e05500] text-white rounded-2xl rounded-tr-xs px-4 py-2.5 shadow-md shadow-orange-500/5'
                                        : 'bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-orange-500/10 text-slate-800 dark:text-slate-100 rounded-2xl rounded-tl-xs px-4 py-3 shadow-sm'
                                    }`}>
                                        {msg.role === 'user' ? (
                                            <p className="text-xs whitespace-pre-wrap leading-relaxed font-medium">{msg.content}</p>
                                        ) : (
                                            <>
                                                <div
                                                    className="text-xs prose-sm max-w-none [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mb-1 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mb-0.5 [&_p]:mb-1 [&_ul]:ml-3 [&_ul]:mb-1 [&_ol]:ml-3 [&_ol]:mb-1 [&_li]:mb-0.5 [&_table]:text-[10px] [&_th]:px-1.5 [&_th]:py-1 [&_td]:px-1.5 [&_td]:py-1 [&_strong]:font-bold"
                                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                                />
                                                {/* Reusable Action Card Component */}
                                                {msg.action_pending && !msg.action_resolved && (
                                                    <ChatActionCard
                                                        messageIndex={idx}
                                                        actionType={msg.action_type}
                                                        actionArgs={msg.action_args}
                                                        confirmationToken={msg.confirmation_token}
                                                        chatLoading={chatLoading}
                                                        onConfirm={handleConfirmAction}
                                                        onCancel={handleCancelAction}
                                                    />
                                                )}

                                                {/* Reusable Form Pending Component */}
                                                {msg.form_pending && !msg.action_resolved && (
                                                    <ChatPendingForm
                                                        messageIndex={idx}
                                                        confirmationToken={msg.confirmation_token}
                                                        formFields={msg.form_fields}
                                                        chatLoading={chatLoading}
                                                        activeFormValues={activeFormValues}
                                                        onFormChange={handleFormChange}
                                                        onSubmit={handleSubmitForm}
                                                        onCancel={handleCancelAction}
                                                    />
                                                )}
                                            </>
                                        )}
                                        <p className={`text-[8.5px] text-right mt-1.5 font-mono ${msg.role === 'user' ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))}

                            {/* Typing indicator */}
                            {chatLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-orange-500/10 rounded-2xl rounded-tl-xs px-4 py-2.5 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="flex gap-0.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#b24700] animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#b24700] animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#b24700] animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">Lili đang xử lý...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Sessions Drawer */}
                        {showSessions && (
                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end transition-all select-none">
                                <div className="w-4/5 sm:w-3/4 bg-white dark:bg-slate-950 border-l border-slate-200/80 dark:border-slate-800 h-full flex flex-col animate-[slideLeft_0.25s_cubic-bezier(0.16,1,0.3,1)]">
                                    <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <span className="text-xs.5 font-extrabold text-slate-800 dark:text-white flex items-center gap-1.5">
                                            <Icon name="history" className="text-[16px] text-[#b24700]" />
                                            Phiên hội thoại
                                        </span>
                                        <button
                                            onClick={() => setShowSessions(false)}
                                            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
                                        >
                                            <Icon name="close" className="text-[16px]" />
                                        </button>
                                    </div>

                                    {/* Action items inside Drawer */}
                                    <div className="p-3 border-b border-slate-50 dark:border-slate-800/50">
                                        <button
                                            onClick={async () => {
                                                await handleCreateSession();
                                                setShowSessions(false);
                                            }}
                                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-[#b24700] to-[#e05500] hover:from-[#c04b00] hover:to-[#f06000] text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                                        >
                                            <Icon name="add" className="text-[16px]" />
                                            Hội thoại mới
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                                        {sessions.map((sess) => (
                                            <div
                                                key={sess.id}
                                                className={`group flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                                                    sess.id === activeSessionId
                                                        ? 'bg-orange-50/50 dark:bg-orange-950/15 border-orange-200/50 dark:border-orange-900/40'
                                                        : 'bg-slate-50/50 dark:bg-slate-900/30 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50'
                                                }`}
                                            >
                                                <button
                                                    onClick={() => {
                                                        handleSwitchSession(sess.id);
                                                        setShowSessions(false);
                                                    }}
                                                    className="flex-1 text-left min-w-0 pr-2 cursor-pointer"
                                                >
                                                    <p className={`text-xs font-bold truncate ${
                                                        sess.id === activeSessionId 
                                                            ? 'text-[#b24700]' 
                                                            : 'text-slate-700 dark:text-slate-300'
                                                    }`}>
                                                        {sess.title || 'Hội thoại chưa đặt tên'}
                                                    </p>
                                                    <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                                        {sess.id === 'default' ? 'Hệ thống chính' : `${sess.message_count || 0} tin nhắn`}
                                                    </p>
                                                </button>
                                                
                                                {sessions.length > 1 && (
                                                    <button
                                                        onClick={() => handleDeleteSession(sess.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-500 transition-all flex-shrink-0 cursor-pointer"
                                                        title="Xóa hội thoại"
                                                    >
                                                        <Icon name="delete" className="text-[14px]" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Input Area */}
                    <div className="border-t border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-950/50 px-4 py-3">
                        {/* Quick Commands Carousel */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none select-none">
                            {quickCommands.map((cmd) => (
                                <button
                                    key={cmd.label}
                                    type="button"
                                    onClick={() => handleQuickCommand(cmd.prompt)}
                                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold bg-orange-500/10 hover:bg-orange-500/20 text-[#b24700] dark:text-[#f26d21] border border-[#b24700]/15 dark:border-[#b24700]/10 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                                >
                                    <Icon name={cmd.icon} className="text-[13px]" />
                                    <span>{cmd.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-end gap-2.5">
                            {isRecording ? (
                                <div className="flex-1 flex items-center justify-between bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 px-3.5 py-2 rounded-2xl min-h-[40px] mb-1.5 shadow-inner">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">Recording...</span>
                                        <span className="text-[10px] font-mono font-bold bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded text-rose-700 dark:text-rose-300">
                                            {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                                        </span>
                                    </div>
                                    {/* Advanced Waveform Visualizer */}
                                    <div className="flex items-center gap-1 h-5 px-2">
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave1_0.5s_ease-in-out_infinite]" style={{ height: '10px' }} />
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave2_0.6s_ease-in-out_infinite]" style={{ height: '16px' }} />
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave3_0.4s_ease-in-out_infinite]" style={{ height: '8px' }} />
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave1_0.7s_ease-in-out_infinite]" style={{ height: '18px' }} />
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave2_0.5s_ease-in-out_infinite]" style={{ height: '12px' }} />
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave3_0.8s_ease-in-out_infinite]" style={{ height: '14px' }} />
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave1_0.6s_ease-in-out_infinite]" style={{ height: '9px' }} />
                                        <span className="w-0.5 bg-gradient-to-t from-orange-500 to-red-500 rounded-full origin-bottom animate-[floatSoundWave2_0.4s_ease-in-out_infinite]" style={{ height: '15px' }} />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 relative">
                                    <textarea
                                        ref={chatInputRef}
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleChat();
                                            }
                                        }}
                                        placeholder="Nhập câu lệnh để Lili hỗ trợ..."
                                        rows={1}
                                        className="w-full resize-none rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#b24700]/25 focus:border-[#b24700] transition-all disabled:opacity-50 min-h-[42px] max-h-[120px]"
                                        disabled={chatLoading}
                                    />
                                </div>
                            )}

                            {isRecording ? (
                                <button
                                    onClick={stopRecording}
                                    className="p-3 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md shadow-red-500/20 hover:shadow-red-500/35 transition-all flex-shrink-0 mb-1.5 cursor-pointer animate-pulse"
                                    title="Dừng thu âm và gửi"
                                >
                                    <Icon name="mic_off" className="text-[18px]" />
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={startRecording}
                                        disabled={chatLoading}
                                        className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all flex-shrink-0 mb-1.5 cursor-pointer disabled:opacity-50"
                                        title="Nói câu lệnh giọng nói"
                                    >
                                        <Icon name="mic" className="text-[18px]" />
                                    </button>
                                    <button
                                        onClick={() => handleChat()}
                                        disabled={!chatInput.trim() || chatLoading}
                                        className={`p-3 rounded-2xl transition-all flex-shrink-0 mb-1.5 ${
                                            chatInput.trim() && !chatLoading
                                                ? 'bg-gradient-to-br from-[#b24700] to-[#e05500] hover:scale-105 hover:shadow-md hover:shadow-orange-500/20 text-white cursor-pointer active:scale-95'
                                                : 'bg-slate-200 dark:bg-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                        }`}
                                    >
                                        <Icon name="send" className="text-[18px]" />
                                    </button>
                                </>
                            )}
                        </div>
                        <div className="flex items-center justify-between text-[8px] text-slate-400 dark:text-slate-500 mt-1 px-1 select-none font-medium">
                            <span className="hidden sm:inline">💡 Phím tắt: Enter để gửi tin nhắn</span>
                            <span className="sm:hidden">💡 Nhập hoặc nhấn mic để nói</span>
                            <span>🔒 Lili SecOps Bảo mật</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
