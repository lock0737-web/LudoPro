// ==========================================================================
// ملف endgame.js - معالجة نهاية اللعبة وتحديث الإحصائيات (Firestore)
// ==========================================================================

const winScreen = document.getElementById('win-screen');
const winTitle = document.getElementById('win-title');
const winMessage = document.getElementById('win-message');
const winRewards = document.getElementById('win-rewards');
const btnBackToLobby = document.getElementById('btn-back-to-lobby');

let isGameEnded = false;

const EndgameManager = {
    
    // يتم استدعاؤها من network.js عند استلام حدث الفوز
    triggerWinScreen(winnerData) {
        if (isGameEnded) return; // منع تكرار تنفيذ الدالة
        isGameEnded = true;

        const isAmITheWinner = (winnerData.uid === currentUserData.uid);

        // 1. تخصيص الواجهة
        if (isAmITheWinner) {
            winTitle.innerText = "🏆 لقد فزت! 🏆";
            winMessage.innerText = "عمل رائع! لقد أوصلت جميع بيادقك للوجهة.";
            winRewards.classList.remove('hidden'); // إظهار المكافآت للفائز
            
            // تحديث الإحصائيات الآمن في السيرفر
            this.updateWinnerStats();
        } else {
            winTitle.innerText = "😢 نهاية اللعبة 😢";
            winTitle.style.color = "#EF4444";
            winMessage.innerText = `اللاعب ${winnerData.name} فاز بالمباراة!`;
            winRewards.classList.add('hidden');
            
            // تحديث الخسارة
            this.updateLoserStats();
        }

        // 2. إظهار الشاشة
        winScreen.classList.remove('hidden');
        winScreen.classList.add('active');
    },

    // تحديث قاعدة البيانات للفائز (باستخدام Increment لتجنب التكرار/التعارض)
    updateWinnerStats() {
        const playerRef = db.collection('players').doc(currentUserData.uid);
        
        playerRef.update({
            coins: firebase.firestore.FieldValue.increment(500),
            wins: firebase.firestore.FieldValue.increment(1)
        }).then(() => {
            console.log("تمت إضافة المكافآت والانتصار للسجل بنجاح!");
            // تحديث النسخة المحلية
            currentUserData.coins += 500;
            currentUserData.wins += 1;
        }).catch(err => console.error("خطأ في تحديث إحصائيات الفائز:", err));
    },

    // تحديث قاعدة البيانات للخاسر
    updateLoserStats() {
        const playerRef = db.collection('players').doc(currentUserData.uid);
        
        playerRef.update({
            loses: firebase.firestore.FieldValue.increment(1)
        }).then(() => {
            currentUserData.loses += 1;
        }).catch(err => console.error("خطأ في تحديث إحصائيات الخاسر:", err));
    }
};

// ==========================================
// زر العودة للوبي وإعادة تهيئة اللعبة
// ==========================================
btnBackToLobby.addEventListener('click', () => {
    // 1. إخفاء شاشات اللعب والفوز
    winScreen.classList.remove('active');
    winScreen.classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    
    // 2. إظهار اللوبي مجدداً
    document.getElementById('lobby-screen').classList.remove('hidden');
    document.getElementById('lobby-screen').classList.add('active');
    
    // 3. مسح بيانات الغرفة وإيقاف المستمعات لمنع تداخل الجلسات
    isGameEnded = false;
    if (typeof NetworkManager !== 'undefined') {
        if (NetworkManager.roomId) {
            rtdb.ref(`rooms/${NetworkManager.roomId}`).off(); // إيقاف الاستماع
        }
        NetworkManager.isReady = false;
        NetworkManager.roomId = null;
        NetworkManager.myColor = null;
    }

    // 4. إعادة ضبط أزرار اللوبي (تم تعريفها في room.js)
    if (typeof resetLobbyButtons === 'function') {
        resetLobbyButtons();
    }
    
    // 5. تنظيف لوحة اللعب استعداداً للمباراة القادمة
    if (typeof LudoController !== 'undefined') {
        document.getElementById('pawns-layer').innerHTML = '';
        LudoController.moveQueue = [];
        LudoController.consecutiveSixes = 0;
    }
});
