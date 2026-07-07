// ==========================================================================
// ملف profile.js - نظام الملف التعريفي، الأصدقاء، وحالة التواجد (Online/Offline)
// الإصدار النهائي والكامل
// ==========================================================================

// 1. تعريف عناصر الواجهة (DOM Elements)
// ---------------------------------------------------------
// عناصر الشريط العلوي (Navbar)
const btnTopProfile = document.getElementById('btn-top-profile');
const topName = document.getElementById('top-name');
const topCoins = document.getElementById('top-coins');
const topAvatar = document.getElementById('top-avatar');

// عناصر نافذة تعديل الملف الشخصي
const editProfileModal = document.getElementById('edit-profile-modal');
const btnCloseEdit = document.getElementById('btn-close-edit');
const btnSaveProfile = document.getElementById('btn-save-profile');
const editNameInput = document.getElementById('edit-name-input');
const editAvatarPreview = document.getElementById('edit-avatar-preview');

// عناصر نافذة الأصدقاء
const btnOpenFriends = document.getElementById('btn-open-friends');
const btnCloseFriends = document.getElementById('btn-close-friends');
const friendsModal = document.getElementById('friends-modal');
const addFriendInput = document.getElementById('add-friend-input'); // حقل إدخال الـ ID
const btnAddFriendAction = document.getElementById('btn-add-friend-action'); // زر الإضافة
const friendsListContainer = document.getElementById('friends-list-container');

// متغير لحفظ مستمعات الاتصال (Listeners) لإيقافها عند إغلاق النافذة (لتوفير باقة الإنترنت والذاكرة)
let presenceListeners = [];

// ==========================================================================
// 2. تحديث الشريط العلوي وصور العرض (يتم استدعاؤه تلقائياً)
// ==========================================================================
function updateTopNavbar() {
    if (!currentUserData) return;
    
    // تحديث البيانات النصية
    topName.innerText = currentUserData.name;
    topCoins.innerText = currentUserData.coins;
    
    // توليد أو جلب صورة العرض الشخصية (Avatar)
    const avatarUrl = currentUserData.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUserData.name}`;
    topAvatar.src = avatarUrl;
    editAvatarPreview.src = avatarUrl;
}

// مراقبة تحميل الصفحة لتحديث الشريط فور توفر البيانات من auth.js
const checkDataInterval = setInterval(() => {
    if (typeof currentUserData !== 'undefined' && currentUserData !== null) {
        updateTopNavbar();
        clearInterval(checkDataInterval);
    }
}, 500);

// ==========================================================================
// 3. نظام تعديل الملف الشخصي (Edit Profile)
// ==========================================================================

// فتح نافذة التعديل
btnTopProfile.addEventListener('click', () => {
    editNameInput.value = currentUserData.name;
    editProfileModal.classList.remove('hidden');
    editProfileModal.classList.add('active');
});

// إغلاق نافذة التعديل
btnCloseEdit.addEventListener('click', () => {
    editProfileModal.classList.remove('active');
    editProfileModal.classList.add('hidden');
});

// حفظ التعديلات في قاعدة البيانات (Firestore)
btnSaveProfile.addEventListener('click', async () => {
    const newName = editNameInput.value.trim();
    
    if (!newName || newName.length < 3) {
        alert("يجب أن يتكون الاسم من 3 أحرف على الأقل.");
        return;
    }

    btnSaveProfile.disabled = true;
    btnSaveProfile.innerText = "جاري الحفظ...";

    try {
        await db.collection('players').doc(currentUserData.uid).update({
            name: newName
        });
        
        // تحديث البيانات المحلية والواجهة
        currentUserData.name = newName;
        updateTopNavbar();
        
        editProfileModal.classList.remove('active');
        editProfileModal.classList.add('hidden');
    } catch (error) {
        console.error("خطأ في تحديث الملف الشخصي:", error);
        alert("حدث خطأ أثناء الحفظ. تأكد من اتصالك بالإنترنت.");
    }

    btnSaveProfile.disabled = false;
    btnSaveProfile.innerText = "حفظ ✔️";
});

// ==========================================================================
// 4. نظام الأصدقاء وإضافة صديق جديد عبر الـ ID
// ==========================================================================

// فتح نافذة الأصدقاء وجلب القائمة من السيرفر
btnOpenFriends.addEventListener('click', () => {
    friendsModal.classList.remove('hidden');
    friendsModal.classList.add('active');
    loadFriendsList();
});

// إغلاق النافذة وتنظيف المستمعات
btnCloseFriends.addEventListener('click', () => {
    friendsModal.classList.remove('active');
    friendsModal.classList.add('hidden');
    addFriendInput.value = '';
    
    // إيقاف التنصت اللحظي على حالة الأصدقاء لتخفيف الضغط
    presenceListeners.forEach(listener => {
        rtdb.ref(`/status/${listener.uid}`).off('value', listener.fn);
    });
    presenceListeners = []; // تصفير المصفوفة
});

// وظيفة إضافة صديق والبحث عنه
btnAddFriendAction.addEventListener('click', async () => {
    const friendId = addFriendInput.value.trim().toUpperCase();
    
    if (friendId.length !== 6) {
        alert("يرجى إدخال معرف (ID) صحيح مكون من 6 أحرف/أرقام.");
        return;
    }
    
    if (friendId === currentUserData.playerId) {
        alert("لا يمكنك إضافة نفسك إلى قائمة الأصدقاء!");
        return;
    }

    btnAddFriendAction.disabled = true;
    btnAddFriendAction.innerText = "⏳";

    try {
        // البحث عن اللاعب في Firestore باستخدام حقله الفريد
        const snapshot = await db.collection('players').where("playerId", "==", friendId).get();
        
        if (snapshot.empty) {
            alert("لم يتم العثور على أي لاعب يحمل هذا المعرف. تأكد من الرقم وصيغته.");
        } else {
            const friendDoc = snapshot.docs[0];
            const friendData = friendDoc.data();
            
            // بناء كائن الصديق الجديد
            const newFriend = {
                uid: friendDoc.id,
                name: friendData.name,
                playerId: friendData.playerId,
                photo: friendData.photo || ""
            };

            // التأكد من وجود مصفوفة الأصدقاء في المتغير المحلي
            if (!currentUserData.friends) currentUserData.friends = [];
            
            // التحقق من عدم إضافة الصديق مسبقاً
            const isAlreadyFriend = currentUserData.friends.some(f => f.uid === newFriend.uid);
            
            if (isAlreadyFriend) {
                alert("هذا اللاعب موجود بالفعل في قائمة أصدقائك.");
            } else {
                // إضافة الصديق إلى السيرفر باستخدام arrayUnion لتجنب التعارض
                await db.collection('players').doc(currentUserData.uid).update({
                    friends: firebase.firestore.FieldValue.arrayUnion(newFriend)
                });
                
                // التحديث المحلي
                currentUserData.friends.push(newFriend);
                addFriendInput.value = '';
                
                alert(`تمت إضافة [ ${newFriend.name} ] إلى قائمة أصدقائك بنجاح! 🎉`);
                
                // إعادة رسم القائمة فوراً
                loadFriendsList();
            }
        }
    } catch (error) {
        console.error("خطأ في إضافة الصديق:", error);
        alert("حدث خطأ أثناء الاتصال. يرجى المحاولة لاحقاً.");
    }

    btnAddFriendAction.disabled = false;
    btnAddFriendAction.innerText = "➕ إضافة";
});

// ==========================================================================
// 5. جلب وتحديث الأصدقاء وحالتهم اللحظية (Online / Offline Engine)
// ==========================================================================

async function loadFriendsList() {
    friendsListContainer.innerHTML = '<div style="text-align: center; color: #94A3B8; margin-top: 20px; font-weight: bold;">جاري تحميل الأصدقاء...</div>';

    try {
        // إعادة سحب بيانات المستخدم الحالية لضمان جلب أحدث قائمة من السيرفر
        const userDoc = await db.collection('players').doc(currentUserData.uid).get();
        currentUserData = userDoc.data();

        const friends = currentUserData.friends || [];

        if (friends.length === 0) {
            friendsListContainer.innerHTML = '<div style="text-align: center; color: #94A3B8; margin-top: 20px; line-height: 1.8;">لا يوجد أصدقاء بعد.<br>قم بإضافة صديق عن طريق الـ ID الخاص به!</div>';
            return;
        }

        friendsListContainer.innerHTML = ''; // تفريغ القائمة للبدء بالرسم

        friends.forEach(friend => {
            // إنشاء الهيكل الأساسي لبطاقة الصديق
            const friendElement = document.createElement('div');
            friendElement.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; border-left: 4px solid #64748B; transition: border-color 0.3s;";
            
            const avatarUrl = friend.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.name}`;

            friendElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${avatarUrl}" style="width: 40px; height: 40px; border-radius: 50%; background: #334155;">
                    <div>
                        <div style="font-weight: bold; font-size: 15px; color: white;">${friend.name}</div>
                        <div id="status-text-${friend.uid}" style="font-size: 12px; color: #94A3B8; font-weight: bold;">جاري التحقق...</div>
                    </div>
                </div>
                <button id="invite-btn-${friend.uid}" class="btn-3d btn-blue" style="padding: 6px 12px; font-size: 13px; width: auto; border-radius: 8px; opacity: 0.5; cursor: not-allowed;" disabled>دعوة ⚔️</button>
            `;

            friendsListContainer.appendChild(friendElement);

            // ==========================================
            // مراقبة حالة الاتصال الخاصة بهذا الصديق (Presence)
            // ==========================================
            const statusRef = rtdb.ref(`/status/${friend.uid}`);
            
            const statusListener = statusRef.on('value', (snapshot) => {
                const statusText = document.getElementById(`status-text-${friend.uid}`);
                const inviteBtn = document.getElementById(`invite-btn-${friend.uid}`);
                
                if (snapshot.exists() && snapshot.val().online === true) {
                    // الصديق متصل الآن
                    statusText.innerText = "متصل الآن 🟢";
                    statusText.style.color = "#10B981";
                    friendElement.style.borderLeftColor = "#10B981"; // تلوين الإطار الجانبي بالأخضر
                    
                    // تفعيل زر الدعوة
                    inviteBtn.style.opacity = "1";
                    inviteBtn.style.cursor = "pointer";
                    inviteBtn.disabled = false;
                    
                    inviteBtn.onclick = () => sendGameInvite(friend.uid, friend.name);
                } else {
                    // الصديق غير متصل
                    statusText.innerText = "غير متصل ⚪";
                    statusText.style.color = "#94A3B8";
                    friendElement.style.borderLeftColor = "#64748B"; // إطار رمادي
                    
                    // تعطيل زر الدعوة
                    inviteBtn.style.opacity = "0.5";
                    inviteBtn.style.cursor = "not-allowed";
                    inviteBtn.disabled = true;
                }
            });

            // حفظ المستمع في المصفوفة لإيقافه لاحقاً
            presenceListeners.push({ uid: friend.uid, fn: statusListener });
        });
    } catch (error) {
        console.error("خطأ في تحميل الأصدقاء:", error);
        friendsListContainer.innerHTML = '<div style="text-align: center; color: #EF4444; margin-top: 20px;">فشل تحميل قائمة الأصدقاء.</div>';
    }
}

// ==========================================================================
// 6. نظام إرسال الدعوات (تمهيد للأنظمة المستقبلية)
// ==========================================================================
function sendGameInvite(friendUid, friendName) {
    // يمكن ربطها لاحقاً بإنشاء غرفة خاصة ودفع إشعار للصديق
    alert(`تم إرسال دعوة للعب إلى ${friendName}! (سيتم برمجة استقبال الإشعارات لاحقاً)`);
}
