// ==========================================================================
// ملف chat.js - نظام الدردشة اللحظية داخل الغرفة
// ==========================================================================

const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatBody = document.getElementById('chat-body');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
const chatBadge = document.getElementById('chat-badge');

let unreadMessages = 0;
let isChatOpen = false;
let isChatInitialized = false;

// 1. فتح وإغلاق صندوق الدردشة
chatToggleBtn.addEventListener('click', () => {
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
        chatBody.classList.remove('hidden');
        unreadMessages = 0;
        updateBadge();
        scrollToBottom();
        chatInput.focus(); // تحسين UX: وضع المؤشر جاهزاً للكتابة فور فتح الدردشة
    } else {
        chatBody.classList.add('hidden');
    }
});

// 2. إرسال الرسالة (عن طريق الزر أو زر Enter)
btnSendChat.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    // التأكد من أننا داخل غرفة وأن الشبكة جاهزة
    if (typeof NetworkManager === 'undefined' || !NetworkManager.isReady) {
        alert("لم يتم الاتصال بالغرفة بعد.");
        return;
    }

    // بناء كائن الرسالة
    const messageData = {
        uid: currentUserData.uid,
        name: currentUserData.name,
        color: myPlayerColor, // لإظهار اسم اللاعب بلونه في اللعبة
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    // إرسال الرسالة إلى مسار الدردشة داخل الغرفة الحالية
    rtdb.ref(`rooms/${NetworkManager.roomId}/chat`).push(messageData)
        .then(() => {
            chatInput.value = ''; // تفريغ الحقل بعد الإرسال
        })
        .catch(err => console.error("خطأ في إرسال الرسالة:", err));
}

// 3. الاستماع للرسائل الجديدة (يجب استدعاؤها من network.js عند دخول الغرفة)
function initChatListener(roomId) {
    if (isChatInitialized) return;
    isChatInitialized = true;

    // نجلب آخر 20 رسالة فقط لمنع الثقل واستهلاك البيانات
    const chatRef = rtdb.ref(`rooms/${roomId}/chat`).limitToLast(20); 

    chatRef.on('child_added', (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg);

        // زيادة عداد الإشعارات إذا كانت الدردشة مغلقة والرسالة من شخص آخر
        if (!isChatOpen && msg.uid !== currentUserData.uid) {
            unreadMessages++;
            updateBadge();
        }
    });
}

// 4. رسم الرسالة في الواجهة
function renderMessage(msg) {
    const isMine = (msg.uid === currentUserData.uid);
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${isMine ? 'msg-mine' : 'msg-others'}`;

    // إعداد لون اسم المرسل (متطابق مع لون لاعبه)
    const colorHex = getTeamHexColor(msg.color);

    msgDiv.innerHTML = `
        <div class="msg-sender" style="color: ${isMine ? '#fff' : colorHex};">
            ${isMine ? 'أنت' : msg.name}
        </div>
        <div class="msg-text">${escapeHTML(msg.text)}</div>
    `;

    chatMessages.appendChild(msgDiv);
    
    // النزول لأسفل القائمة لرؤية الرسالة الجديدة
    if (isChatOpen) scrollToBottom();
}

// ==========================================
// دوال مساعدة (Helpers)
// ==========================================

function scrollToBottom() {
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
}

function updateBadge() {
    if (unreadMessages > 0) {
        chatBadge.innerText = unreadMessages;
        chatBadge.classList.remove('hidden');
    } else {
        chatBadge.classList.add('hidden');
    }
}

// تحويل اسم اللون إلى رمز Hex للتنسيق
function getTeamHexColor(colorName) {
    const colors = {
        red: '#EF4444',
        green: '#10B981',
        yellow: '#F59E0B',
        blue: '#3B82F6'
    };
    return colors[colorName] || '#CBD5E1';
}

// حماية من ثغرات XSS (Cross-Site Scripting)
function escapeHTML(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}
