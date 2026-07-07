// ==========================================================================
// ملف network.js - نظام المزامنة اللحظية (Multiplayer Sync Engine)
// الإصدار النهائي الشامل مع دعم 2P/4P وقفل الأمان
// ==========================================================================

const NetworkManager = {
    roomId: null,
    myColor: null,
    isReady: false,
    roomData: null,
    
    // متغيرات زمنية لمنع تكرار الأحداث القديمة عند تحميل اللعبة
    initTimestamp: Date.now(), 
    lastDiceTimestamp: 0,
    lastMoveTimestamp: 0,

    // =======================================================
    // 1. تهيئة الشبكة (تُستدعى من room.js عند دخول الغرفة)
    // =======================================================
    init(roomId, color) {
        this.roomId = roomId;
        this.myColor = color;
        this.isReady = true;
        this.initTimestamp = Date.now(); // تصفير العداد عند دخول غرفة جديدة
        
        // تعيين لون اللاعب برمجياً في محرك اللعبة
        myPlayerColor = color; 
        
        console.log(`[الشبكة] تم الاتصال بالغرفة: ${this.roomId}. لونك: ${this.myColor}`);
        
        // بدء الاستماع لأحداث اللعبة
        this.startListening();

        // تفعيل مستمع الدردشة (إن وجد)
        if (typeof initChatListener === 'function') {
            initChatListener(this.roomId);
        }
    },

    // =======================================================
    // 2. مستمعات Firebase (Snapshot Listeners)
    // =======================================================
    startListening() {
        const roomRef = rtdb.ref(`rooms/${this.roomId}`);

        // أ. الاستماع لبيانات الغرفة العامة (انضمام لاعبين، تحديث الأسماء)
        roomRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                this.roomData = snapshot.val();
                
                // تحديث الواجهة والأسماء فور انضمام لاعب جديد
                if (typeof LudoController !== 'undefined') {
                    LudoController.updateUI();
                }

                // التحقق من اكتمال اللاعبين (إظهار الدور بمجرد بدء اللعبة)
                if (this.roomData.status === 'playing') {
                    const turnDisplay = document.getElementById('turn-display');
                    if (turnDisplay) turnDisplay.style.display = 'block';
                }
            }
        });

        // ب. الاستماع لتغيرات النرد (Dice Rolls)
        rtdb.ref(`rooms/${this.roomId}/dice`).on('value', (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                
                // التأكد من أن هذا الحدث جديد ولم يتم تنفيذه مسبقاً
                if (data.timestamp && data.timestamp > this.initTimestamp && data.timestamp > this.lastDiceTimestamp) {
                    this.lastDiceTimestamp = data.timestamp;
                    
                    console.log(`[الشبكة] استلام نتيجة نرد: ${data.result}`);
                    
                    // تشغيل حركة النرد محلياً عند كل اللاعبين
                    if (typeof LudoController !== 'undefined') {
                        LudoController.showDiceAnimation(data.result);
                    }
                }
            }
        });

        // ج. الاستماع لحركات البيادق (Pawn Moves)
        rtdb.ref(`rooms/${this.roomId}/move`).on('value', (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                
                // التأكد من حداثة الحدث
                if (data.timestamp && data.timestamp > this.initTimestamp && data.timestamp > this.lastMoveTimestamp) {
                    this.lastMoveTimestamp = data.timestamp;
                    
                    console.log(`[الشبكة] استلام حركة بيدق: ${data.pawnId} (${data.steps} خطوات)`);
                    
                    // تنفيذ الحركة المرئية عند جميع اللاعبين
                    if (typeof LudoController !== 'undefined') {
                        LudoController.executePawnMove(data.pawnId, data.steps);
                    }
                }
            }
        });

        // د. الاستماع لتغير الدور (Turn Changes)
        rtdb.ref(`rooms/${this.roomId}/currentTurn`).on('value', (snapshot) => {
            if (snapshot.exists()) {
                const turnColor = snapshot.val();
                
                if (typeof LudoController !== 'undefined' && LudoController.currentTurn !== turnColor) {
                    console.log(`[الشبكة] الدور ينتقل إلى: ${turnColor}`);
                    LudoController.setNextTurnLocally(turnColor);
                }
            }
        });

        // هـ. الاستماع لحدث انتهاء اللعبة (Win Event)
        rtdb.ref(`rooms/${this.roomId}/winner`).on('value', (snapshot) => {
            if (snapshot.exists()) {
                const winnerData = snapshot.val();
                
                if (typeof EndgameManager !== 'undefined') {
                    EndgameManager.triggerWinScreen(winnerData);
                }
            }
        });
    },

    // =======================================================
    // 3. دوال إرسال البيانات (تُستدعى من game.js)
    // =======================================================

    /**
     * إرسال نتيجة النرد للسيرفر
     * @param {number} result - الرقم من 1 إلى 6
     */
    sendDiceRoll(result) {
        if (!this.isReady) return;
        
        rtdb.ref(`rooms/${this.roomId}/dice`).set({
            result: result,
            rolledBy: currentUserData.uid,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => console.error("خطأ في إرسال النرد:", err));
    },

    /**
     * إرسال حركة البيدق للسيرفر
     * @param {string} pawnId - معرف البيدق (مثال: red-0)
     * @param {number} steps - عدد الخطوات المقطوعة
     */
    sendPawnMove(pawnId, steps) {
        if (!this.isReady) return;
        
        rtdb.ref(`rooms/${this.roomId}/move`).set({
            pawnId: pawnId,
            steps: steps,
            movedBy: currentUserData.uid,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).catch(err => console.error("خطأ في إرسال الحركة:", err));
        
        // تحديث المصفوفة الكلية للغرفة (لحفظ حالة اللعبة في حال قطع الاتصال)
        this.syncBoardStateLocally();
    },

    /**
     * إرسال تغير الدور للسيرفر (متوافق مع نمط 2P و 4P)
     */
    sendNextTurn() {
        if (!this.isReady) return;
        
        // استخدام المصفوفة الفعالة من LudoController لمعرفة الفرق المشاركة (2 أو 4 لاعبين)
        const active = LudoController.activeTeams; 
        const index = active.indexOf(LudoController.currentTurn);
        const nextTurnColor = active[(index + 1) % active.length];
        
        rtdb.ref(`rooms/${this.roomId}/currentTurn`).set(nextTurnColor)
            .catch(err => console.error("خطأ في إرسال الدور التالي:", err));
    },

    /**
     * إرسال إعلان الفوز للسيرفر
     * @param {string} winningTeam - لون الفريق الفائز
     */
    sendWinEvent(winningTeam) {
        if (!this.isReady) return;
        
        rtdb.ref(`rooms/${this.roomId}/winner`).set({
            team: winningTeam,
            uid: currentUserData.uid,
            name: currentUserData.name,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            // إغلاق الغرفة برمجياً لمنع حركات إضافية
            rtdb.ref(`rooms/${this.roomId}/status`).set('finished');
        });
    },

    /**
     * حفظ حالة البيادق في السيرفر (Snapshoting)
     * لتسهيل إعادة الاتصال (Reconnect) إذا خرج لاعب وعاد للغرفة
     */
    syncBoardStateLocally() {
        if (!this.isReady || !LudoController.pawns) return;

        let boardState = { red: [], green: [], yellow: [], blue: [] };
        
        // تجميع مواضع كل البيادق
        Object.values(LudoController.pawns).forEach(p => {
            if (boardState[p.team]) {
                boardState[p.team].push({
                    state: p.state,
                    positionIndex: p.positionIndex
                });
            }
        });

        // رفع اللوحة المحدثة للسيرفر
        rtdb.ref(`rooms/${this.roomId}/boardState`).set(boardState);
    }
};
