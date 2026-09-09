/* AI_NAVIGATION_MAP_START */
/**
 * 🗺️ BẢN ĐỒ ĐỊNH VỊ CHO AI (AI NAVIGATION MAP)
 * 💡 Hướng dẫn định vị: AI Agent đọc bản đồ này để hiểu cấu trúc của React hook quản lý AI Chat.
 * 
 * Tầng 1: Khởi tạo Trạng thái & Khai báo Hook
 *   - Hàm hook React chính quản lý hội thoại AI -> Dòng 33
 *   - Hàm cuộn màn hình xuống cuối danh sách tin nhắn -> Dòng 61
 * 
 * Tầng 2: Quản lý Phiên Trò chuyện & Lịch sử (Session & History Management)
 *   - Tải danh sách các phiên trò chuyện (Chat Sessions) -> Dòng 85
 *   - Tải lịch sử tin nhắn của phiên trò chuyện hiện tại -> Dòng 110
 * 
 * Tầng 3: Tương tác Âm thanh & Chuyển đổi Văn bản thành Giọng nói (TTS Layer)
 *   - Chuyển đổi văn bản thành giọng nói tiếng Việt (Text to Speech - TTS) -> Dòng 166
 * 
 * Tầng 4: Xử lý Gửi Tin nhắn & Nhận phản hồi (Chat Flow Orchestrator)
 *   - Gửi tin nhắn chat mới của người dùng và nhận phản hồi từ API -> Dòng 195
 * 
 * Tầng 5: Phê duyệt Hành động của Con người (Human-in-the-loop Gate)
 *   - Phê duyệt (Xác nhận) một hành động cần sự đồng ý của con người (Human-in-the-loop) -> Dòng 269
 *   - Từ chối (Hủy bỏ) hành động đang chờ phê duyệt -> Dòng 318
 *   - Gửi dữ liệu form điền thông tin bổ sung để thực hiện hành động -> Dòng 367
 * 
 * Tầng 6: Xử lý Ghi âm & Gửi âm thanh nhận diện (STT / Voice Input Layer)
 *   - Bắt đầu ghi âm qua microphone để nhập liệu giọng nói -> Dòng 434
 *   - Gửi file âm thanh đã ghi lên API để nhận diện giọng nói (Speech to Text - STT) -> Dòng 476
 * 
 * 🚨 BẮT BUỘC: Khi chỉnh sửa logic hoặc cấu trúc file useAIChat.ts làm xê dịch dòng,
 * bạn phải chạy lại công cụ cập nhật bản đồ này để đồng bộ hóa tọa độ dòng chính xác!
 */
/* AI_NAVIGATION_MAP_END */



'use client';

import { useState, useEffect, useRef } from 'react';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    action_pending?: boolean;
    form_pending?: boolean;
    action_resolved?: boolean;
    action_type?: string;
    action_args?: any;
    confirmation_token?: string;
    form_fields?: any[];
}

export interface ChatSession {
    id: string;
    title: string;
    message_count: number;
    updated_at: string;
}

const LOCAL_STORAGE_KEY = 'lunch_admin_active_session_id';

export function useAIChat() {
    // Basic chat states
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);

    // Session management states
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string>('default');
    const [sessionsLoaded, setSessionsLoaded] = useState(false);
    const [showSessions, setShowSessions] = useState(false);

    // Form pending state
    const [activeFormValues, setActiveFormValues] = useState<Record<number, any>>({});

    // Voice / Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    // Speech Ref & Recording Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Auto scroll chat to bottom
    const scrollToBottom = () => {
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    // Load active session from localStorage on initialization
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
                setActiveSessionId(stored);
            }
        }
    }, []);

    // Save active session to localStorage when changed
    useEffect(() => {
        if (typeof window !== 'undefined' && sessionsLoaded) {
            localStorage.setItem(LOCAL_STORAGE_KEY, activeSessionId);
        }
    }, [activeSessionId, sessionsLoaded]);

    // Load sessions from DB on mount
    const loadSessions = async () => {
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'list_sessions' }),
            });
            if (response.ok) {
                const data = await response.json();
                setSessions(data.sessions || []);
            }
        } catch (err) {
            console.error('Failed to load chat sessions:', err);
        } finally {
            setSessionsLoaded(true);
        }
    };

    useEffect(() => {
        if (!sessionsLoaded) {
            loadSessions();
        }
    }, [sessionsLoaded]);

    // Load history when activeSessionId changes
    const loadHistory = async (sessionId: string) => {
        setChatLoading(true);
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'load_history', session_id: sessionId }),
            });
            if (response.ok) {
                const data = await response.json();
                setChatMessages(data.history || []);
                scrollToBottom();
            } else {
                setChatMessages([]);
            }
        } catch (err) {
            console.error('Failed to load chat history:', err);
            setChatMessages([]);
        } finally {
            setChatLoading(false);
        }
    };

    useEffect(() => {
        if (sessionsLoaded) {
            loadHistory(activeSessionId);
        }
    }, [activeSessionId, sessionsLoaded]);

    // Handle timer for recording
    useEffect(() => {
        if (isRecording) {
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } else {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, [isRecording]);

    // Stop TTS when session or tab changes
    useEffect(() => {
        stopSpeaking();
        return () => stopSpeaking();
    }, [activeSessionId]);

    // --- TTS (Text to Speech) Helpers ---
    const speakText = (text: string) => {
        if (isMuted) return;
        window.speechSynthesis.cancel();
        
        // Remove markdown formatting
        const cleanText = text
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/#+\s+/g, '')
            .replace(/-\s+/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

        const utterance = new SpeechSynthesisUtterance(cleanText);
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VI'));
        if (viVoice) {
            utterance.voice = viVoice;
        }
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
    };

    const stopSpeaking = () => {
        window.speechSynthesis.cancel();
    };

    // --- Send Message ---
    const handleChat = async (inputOverride?: string) => {
        const text = inputOverride !== undefined ? inputOverride : chatInput;
        if (!text.trim()) return;

        if (inputOverride === undefined) {
            setChatInput('');
        }

        stopSpeaking();

        const userMessage: ChatMessage = {
            role: 'user',
            content: text,
            timestamp: new Date().toISOString()
        };

        setChatMessages(prev => [...prev, userMessage]);
        setChatLoading(true);
        scrollToBottom();

        // Save history snapshot to send to backend for context
        const historySnapshot = chatMessages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: historySnapshot,
                    session_id: activeSessionId
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Gặp lỗi khi xử lý chat.');
            }

            const data = await response.json();

            const botMessage: ChatMessage = {
                role: 'assistant',
                content: data.reply || 'Dạ em chưa nhận được phản hồi từ AI, anh thử gửi lại câu hỏi giúp em nhé!',
                timestamp: data.timestamp || new Date().toISOString(),
                action_pending: data.action_pending,
                form_pending: data.form_pending,
                action_type: data.action_type,
                action_args: data.action_args,
                confirmation_token: data.confirmation_token,
                form_fields: data.form_fields
            };

            setChatMessages(prev => [...prev, botMessage]);
            speakText(data.reply);
            scrollToBottom();
        } catch (err: any) {
            const errorMsg = err.message || 'Lỗi hệ thống';
            const botError: ChatMessage = {
                role: 'assistant',
                content: `❌ **Lỗi:** ${errorMsg}`,
                timestamp: new Date().toISOString()
            };
            setChatMessages(prev => [...prev, botError]);
            scrollToBottom();
        } finally {
            setChatLoading(false);
        }
    };

    // --- Action Confirmation ---
    const handleConfirmAction = async (msgIdx: number, token: string, formValues?: Record<string, any>) => {
        setChatLoading(true);
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'confirm_action',
                    confirmation_token: token,
                    form_values: formValues,
                    session_id: activeSessionId
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Có lỗi xảy ra khi xác nhận.');
            }

            const data = await response.json();

            setChatMessages(prev => {
                const copy = [...prev];
                if (copy[msgIdx]) {
                    copy[msgIdx] = {
                        ...copy[msgIdx],
                        action_pending: false,
                        form_pending: false,
                        action_resolved: true
                    };
                }
                return copy;
            });

            const resultMessage: ChatMessage = {
                role: 'assistant',
                content: data.reply,
                timestamp: data.timestamp || new Date().toISOString()
            };
            setChatMessages(prev => [...prev, resultMessage]);
            speakText(data.reply);
            scrollToBottom();
        } catch (err: any) {
            alert(err.message || 'Lỗi hệ thống');
        } finally {
            setChatLoading(false);
        }
    };

    // --- Action Cancellation ---
    const handleCancelAction = async (msgIdx: number, token: string) => {
        setChatLoading(true);
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'cancel_action',
                    confirmation_token: token,
                    session_id: activeSessionId
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Có lỗi xảy ra khi hủy bỏ.');
            }

            const data = await response.json();

            setChatMessages(prev => {
                const copy = [...prev];
                if (copy[msgIdx]) {
                    copy[msgIdx] = {
                        ...copy[msgIdx],
                        action_pending: false,
                        form_pending: false,
                        action_resolved: true
                    };
                }
                return copy;
            });

            const resultMessage: ChatMessage = {
                role: 'assistant',
                content: data.reply,
                timestamp: data.timestamp || new Date().toISOString()
            };
            setChatMessages(prev => [...prev, resultMessage]);
            speakText(data.reply);
            scrollToBottom();
        } catch (err: any) {
            alert(err.message || 'Lỗi hệ thống');
        } finally {
            setChatLoading(false);
        }
    };

    // --- Submit Form Pending ---
    const handleSubmitForm = async (msgIdx: number, token: string, fields: any[]) => {
        const values: Record<string, any> = {};
        fields.forEach(f => {
            values[f.name] = activeFormValues[msgIdx]?.[f.name] !== undefined 
                ? activeFormValues[msgIdx][f.name] 
                : f.defaultValue;
        });

        setChatLoading(true);
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'confirm_action',
                    confirmation_token: token,
                    form_values: values,
                    session_id: activeSessionId
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Có lỗi xảy ra khi gửi form.');
            }

            const data = await response.json();

            setChatMessages(prev => {
                const copy = [...prev];
                if (copy[msgIdx]) {
                    copy[msgIdx] = {
                        ...copy[msgIdx],
                        action_pending: false,
                        form_pending: false,
                        action_resolved: true
                    };
                }
                return copy;
            });

            const resultMessage: ChatMessage = {
                role: 'assistant',
                content: data.reply,
                timestamp: data.timestamp || new Date().toISOString()
            };
            setChatMessages(prev => [...prev, resultMessage]);
            speakText(data.reply);
            scrollToBottom();
        } catch (err: any) {
            alert(err.message || 'Lỗi hệ thống');
        } finally {
            setChatLoading(false);
        }
    };

    const handleFormChange = (msgIdx: number, fieldName: string, value: any) => {
        setActiveFormValues(prev => ({
            ...prev,
            [msgIdx]: {
                ...(prev[msgIdx] || {}),
                [fieldName]: value
            }
        }));
    };

    // --- Voice Recording (STT) Helpers ---
    const startRecording = async () => {
        stopSpeaking();
        audioChunksRef.current = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = (reader.result as string).split(',')[1];
                    sendVoiceMessage(base64data, mediaRecorder.mimeType);
                };
                
                // Stop all audio tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error('Không thể truy cập microphone:', err);
            alert('Không thể mở microphone. Vui lòng kiểm tra quyền truy cập của trình duyệt.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const sendVoiceMessage = async (base64Audio: string, mimeType: string) => {
        setChatLoading(true);
        const placeholderMsg: ChatMessage = {
            role: 'user',
            content: '🎤 *[Đang chuyển đổi giọng nói...]*',
            timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, placeholderMsg]);
        scrollToBottom();

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio: base64Audio,
                    mimeType: mimeType,
                    session_id: activeSessionId
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Lỗi khi gửi voice.');
            }

            const data = await response.json();

            // Replace placeholder message with recognized text
            setChatMessages(prev => {
                const copy = [...prev];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].content.includes('[Đang chuyển đổi')) {
                    copy[lastIdx] = {
                        ...copy[lastIdx],
                        content: `🎤 *"${data.recognizedText}"*`
                    };
                }
                return copy;
            });

            const botMessage: ChatMessage = {
                role: 'assistant',
                content: data.reply,
                timestamp: data.timestamp || new Date().toISOString(),
                action_pending: data.action_pending,
                form_pending: data.form_pending,
                action_type: data.action_type,
                action_args: data.action_args,
                confirmation_token: data.confirmation_token,
                form_fields: data.form_fields
            };

            setChatMessages(prev => [...prev, botMessage]);
            speakText(data.reply);
            scrollToBottom();
        } catch (err: any) {
            const errorMsg = err.message || 'Lỗi chuyển giọng nói';
            setChatMessages(prev => {
                const copy = [...prev];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].content.includes('[Đang chuyển đổi')) {
                    copy[lastIdx] = {
                        ...copy[lastIdx],
                        content: `❌ *[Ghi âm thất bại]*`
                    };
                }
                return copy;
            });
            const botError: ChatMessage = {
                role: 'assistant',
                content: `❌ **Lỗi:** ${errorMsg}`,
                timestamp: new Date().toISOString()
            };
            setChatMessages(prev => [...prev, botError]);
            scrollToBottom();
        } finally {
            setChatLoading(false);
        }
    };

    // --- Session Management Handlers ---
    const handleCreateSession = async (title?: string) => {
        const sessionTitle = title || `Cuộc hội thoại #${sessions.length + 1}`;
        setChatLoading(true);
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_session', title: sessionTitle })
            });
            if (response.ok) {
                const data = await response.json();
                setSessions(prev => [data.session, ...prev]);
                setActiveSessionId(data.session.id);
            }
        } catch (err) {
            console.error('Failed to create session:', err);
        } finally {
            setChatLoading(false);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!confirm('Bạn có chắc muốn xóa cuộc hội thoại này?')) return;
        setChatLoading(true);
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_session', session_id: sessionId })
            });
            if (response.ok) {
                setSessions(prev => prev.filter(s => s.id !== sessionId));
                if (activeSessionId === sessionId) {
                    setActiveSessionId('default');
                }
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
        } finally {
            setChatLoading(false);
        }
    };

    const handleSwitchSession = (sessionId: string) => {
        setActiveSessionId(sessionId);
        setShowSessions(false);
    };

    const handleClearChat = async () => {
        if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử trong hội thoại này?')) return;
        setChatLoading(true);
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clear_history', session_id: activeSessionId })
            });
            if (response.ok) {
                setChatMessages([]);
            }
        } catch (err) {
            console.error('Failed to clear chat history:', err);
        } finally {
            setChatLoading(false);
        }
    };

    return {
        // States
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
        
        // State Setters
        setChatInput,
        setShowSessions,
        setIsMuted,

        // Actions
        handleChat,
        handleConfirmAction,
        handleCancelAction,
        handleSubmitForm,
        handleFormChange,
        handleCreateSession,
        handleDeleteSession,
        handleSwitchSession,
        handleClearChat,
        
        // Voice Actions
        startRecording,
        stopRecording,
        speakText,
        stopSpeaking,

        // Refs
        chatEndRef,
        chatInputRef
    };
}
