// ==========================================================================
// ملف auth.js - نظام المصادقة (الزائر)، الاستعادة التلقائية، ومراقبة التواجد
// ==========================================================================

// 1. تعريف عناصر الواجهة (DOM Elements)
const loginScreen = document.getElementById('login-screen');
// ملاحظة: تم الإبقاء على نفس الـ ID (btn-google-login) لكي لا نضطر لتعديل ملف HTML، لكن الوظيفة أصبحت للزائر
const btnGoogleLogin = document.getElementById('btn-google-login'); 
const playerNameInput = document.getElementById('player-name-input');
const playerInfoPreview = document.getElementById('player-info-preview');
const previewId = document.getElementById('preview-id');
const btnEnterGame = document.getElementById('btn-enter-game');

// متغير عام لتخزين بيانات اللاعب الحالي بعد تسجيل الدخول لاستخدامه في باقي الملفات
let currentUserData = null;

// ==========================================================================
// 2. الاستعادة التلقائية للجلسة (Auto-Login)
// ==========================================================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // اللاعب مسجل دخوله مسبقاً، تغيير حالة الزر لمنع التداخل
        btnGoogleLogin.disabled = true;
        btnGoogleLogin.innerText = "جاري استعادة الجلسة...";
        playerNameInput.disabled = true;

        try {
            const playerRef = db.collection('players').doc(user.uid);
            const doc = await playerRef.get();

            if (doc.exists) {
                // سحب بيانات اللاعب المحفوظة
                currentUserData = doc.data();
                
                // تحديث الواجهة باسم اللاعب
                playerNameInput.value = currentUserData.name;
                
                // تحديث حالة الاتصال
                await playerRef.update({
                    online: true,
                    lastOnline: firebase.firestore.FieldValue.serverTimestamp()
                });

                // تفعيل نظام مراقبة التواجد
                setupPresence(user.uid);

                // إظهار معرف اللاعب وزر الدخول مباشرة
                btnGoogleLogin.style.display = 'none';
                previewId.innerText = currentUserData.playerId;
                playerInfoPreview.classList.remove('hidden');
            } else {
                // حالة نادرة: المصادقة موجودة لكن لا يوجد ملف في Firestore
                btnGoogleLogin.disabled = false;
                playerNameInput.disabled = false;
                btnGoogleLogin.innerText = "تسجيل الدخول وبدء اللعب";
            }
        } catch (error) {
            console.error("خطأ في استعادة الجلسة:", error);
            btnGoogleLogin.disabled = false;
            playerNameInput.disabled = false;
            btnGoogleLogin.innerText = "تسجيل الدخول وبدء اللعب";
        }
    }
});

// ==========================================================================
// 3. أحداث واجهة المستخدم (UI Events) للتسجيل
// ==========================================================================

// حدث الضغط على زر "تسجيل الدخول"
btnGoogleLogin.addEventListener('click', async () => {
    const playerName = playerNameInput.value.trim();
    
    // التحقق من إدخال الاسم قبل بدء المصادقة
    if (!playerName) {
        alert("يرجى إدخال اسمك الكريم أولاً قبل تسجيل الدخول.");
        playerNameInput.focus();
        return;
    }

    // تعطيل الزر لمنع الضغط المتكرر أثناء الاتصال بالخوادم
    btnGoogleLogin.disabled = true;
    btnGoogleLogin.innerText = "جاري المصادقة...";

    try {
        // المصادقة كزائر (Anonymous) لتجاوز مشاكل الأمان في بيئة الـ EXE والـ APK
        const result = await auth.signInAnonymously();
        
        // تمرير بيانات الحساب والاسم المدخل للمعالجة
        await processUserLogin(result.user, playerName);
        
    } catch (error) {
        console.error("خطأ في المصادقة:", error);
        alert("حدث خطأ أثناء محاولة تسجيل الدخول. تأكد من تفعيل الدخول كزائر (Anonymous) في إعدادات Firebase.");
        
        // إعادة تفعيل الزر في حال الفشل
        btnGoogleLogin.disabled = false;
        btnGoogleLogin.innerText = "تسجيل الدخول وبدء اللعب";
    }
});

// حدث الضغط على زر "دخول اللعبة" (يظهر بعد تأكيد الـ ID)
btnEnterGame.addEventListener('click', () => {
    // إخفاء شاشة تسجيل الدخول
    loginScreen.classList.remove('active');
    loginScreen.classList.add('hidden');
    
    // استدعاء دالة تهيئة اللوبي من ملف room.js وتمرير بيانات اللاعب لها
    if (typeof initRoomSystem === "function") {
        initRoomSystem(currentUserData);
    } else {
        console.error("خطأ: دالة initRoomSystem غير موجودة. تأكد من ربط ملف room.js.");
    }
});

// ==========================================================================
// 4. المعالجة الأساسية لبيانات اللاعب في قاعدة البيانات (Core Logic)
// ==========================================================================

async function processUserLogin(user, enteredName) {
    const playerRef = db.collection('players').doc(user.uid);
    
    try {
        const doc = await playerRef.get();

        if (doc.exists) {
            // اللاعب موجود مسبقاً (تسجيل دخول متكرر)
            currentUserData = doc.data();
            
            // تحديث اسم اللاعب (إذا قام بتغييره) وتحديث وقت الدخول
            await playerRef.update({ 
                name: enteredName,
                online: true, 
                lastOnline: firebase.firestore.FieldValue.serverTimestamp() 
            });
            currentUserData.name = enteredName; // تحديث النسخة المحلية بالذاكرة
            
        } else {
            // لاعب جديد كلياً: توليد ID فريد وحفظ الهيكل الافتراضي
            const newPlayerId = await generateUniqueId();
            
            currentUserData = {
                uid: user.uid,
                name: enteredName,
                email: "guest_" + user.uid.substring(0, 5) + "@ludo.local", // بريد وهمي كونه زائر
                photo: "", 
                playerId: newPlayerId,
                coins: 1000,          // رصيد افتراضي لبدء اللعب كهدية
                wins: 0,
                loses: 0,
                level: 1,
                online: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastOnline: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await playerRef.set(currentUserData);
        }

        // تفعيل نظام مراقبة التواجد (Presence System)
        setupPresence(user.uid);

        // تحديث الواجهة لعرض المعرف (ID) وإظهار زر الدخول
        btnGoogleLogin.style.display = 'none';
        playerNameInput.disabled = true;
        previewId.innerText = currentUserData.playerId;
        playerInfoPreview.classList.remove('hidden');

    } catch (error) {
        console.error("خطأ في قراءة/كتابة بيانات اللاعب:", error);
        alert("حدث خطأ أثناء معالجة بياناتك. يرجى المحاولة لاحقاً.");
        
        btnGoogleLogin.disabled = false;
        btnGoogleLogin.innerText = "تسجيل الدخول وبدء اللعب";
    }
}

// ==========================================================================
// 5. خوارزمية توليد الـ ID الفريد (ID Generation Logic)
// ==========================================================================

async function generateUniqueId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let isUnique = false;
    let generatedId = "";

    // حلقة تكرار للتأكد التام من عدم وجود تعارض مع ID آخر في Firestore
    while (!isUnique) {
        generatedId = "11";
        
        // توليد 3 خانات عشوائية (أحرف أو أرقام)
        for(let i = 0; i < 3; i++) {
            generatedId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // توليد الخانة السادسة والأخيرة كحرف حصراً
        generatedId += letters.charAt(Math.floor(Math.random() * letters.length));

        // فحص Firestore: هل الـ ID موجود لدى لاعب آخر؟
        const snapshot = await db.collection('players').where("playerId", "==", generatedId).get();
        if (snapshot.empty) {
            isUnique = true; // الـ ID فريد وآمن، نخرج من الحلقة
        }
    }
    
    return generatedId;
}

// ==========================================================================
// 6. نظام التواجد والانقطاع المفاجئ (Presence System)
// ==========================================================================

function setupPresence(uid) {
    const userStatusRef = rtdb.ref('/status/' + uid);
    const firestorePlayerRef = db.collection('players').doc(uid);
    
    // استماع لحالة الاتصال الخاصة بـ Firebase (مراقبة نبض الاتصال)
    rtdb.ref('.info/connected').on('value', (snapshot) => {
        // إذا كانت القيمة false، فهذا يعني أن الاتصال لم يكتمل بعد
        if (snapshot.val() === false) return;
        
        // إعداد أمر (onDisconnect): ماذا يجب أن يفعل السيرفر من تلقاء نفسه عند انقطاع الإنترنت فجأة عن اللاعب؟
        userStatusRef.onDisconnect().set({
            online: false,
            last_changed: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            // عند نجاح إعداد onDisconnect، نرسل الحالة الحالية لـ (متصل)
            userStatusRef.set({
                online: true,
                last_changed: firebase.database.ServerValue.TIMESTAMP
            });
            
            // تحديث متزامن في Firestore
            firestorePlayerRef.update({
                online: true,
                lastOnline: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(e => console.warn("تعذر تحديث حالة الاتصال في Firestore", e));
        });
    });

    // التقاط حدث إغلاق المتصفح يدوياً لتسريع تحديث حالة الانقطاع
    window.addEventListener('beforeunload', () => {
        userStatusRef.set({
            online: false,
            last_changed: firebase.database.ServerValue.TIMESTAMP
        });
        firestorePlayerRef.update({
            online: false,
            lastOnline: firebase.firestore.FieldValue.serverTimestamp()
        });
    });
}
