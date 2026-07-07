// ==========================================================================
// ملف room.js - (النسخة النهائية المؤمنة ضد أخطاء المتصفحات والذاكرة المؤقتة)
// ==========================================================================

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const btnQuickMatch = document.getElementById('btn-quick-match');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoomModal = document.getElementById('btn-join-room-modal');
const btnPlayAI = document.getElementById('btn-play-ai');

const btnOpenSettings = document.getElementById('btn-open-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const toggleSfx = document.getElementById('toggle-sfx');
const toggleVibration = document.getElementById('toggle-vibration');

let currentRoomId = null;
let myPlayerColor = null; 

const GameSettings = { sfxEnabled: true, vibrationEnabled: true };

function getSelectedMode() {
    const el = document.querySelector('input[name="game-mode"]:checked');
    return el ? parseInt(el.value) : 4;
}

function initRoomSystem(userData) {
    if (lobbyScreen) {
        lobbyScreen.classList.remove('hidden');
        lobbyScreen.classList.add('active');
    }
}

// ==========================================================================
// حماية الأزرار (Defensive JS) لمنع تعطل الكود
// ==========================================================================
if (btnOpenSettings) btnOpenSettings.addEventListener('click', () => { settingsModal.classList.remove('hidden'); settingsModal.classList.add('active'); });
if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => { settingsModal.classList.remove('active'); settingsModal.classList.add('hidden'); });
if (toggleSfx) toggleSfx.addEventListener('change', (e) => GameSettings.sfxEnabled = e.target.checked);
if (toggleVibration) toggleVibration.addEventListener('change', (e) => GameSettings.vibrationEnabled = e.target.checked);

// 1. لعب ضد الكمبيوتر
if (btnPlayAI) {
    btnPlayAI.addEventListener('click', () => {
        myPlayerColor = 'red';
        currentRoomId = 'local-ai-room';
        lobbyScreen.classList.remove('active');
        lobbyScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        
        if (typeof LudoController !== 'undefined') LudoController.init(2, true); 
    });
}

// 2. لعب سريع أونلاين
if (btnQuickMatch) {
    btnQuickMatch.addEventListener('click', async () => {
        if (!currentUserData) return alert("جاري تحميل بياناتك، انتظر لحظة...");
        btnQuickMatch.innerText = "جاري البحث..."; btnQuickMatch.disabled = true;
        const mode = getSelectedMode();

        try {
            const roomsRef = rtdb.ref('rooms');
            const snapshot = await roomsRef.orderByChild('status').equalTo('waiting').limitToFirst(10).once('value');
            let joined = false;

            if (snapshot.exists()) {
                const rooms = snapshot.val();
                for (let rId in rooms) {
                    if (rooms[rId].type === 'public' && rooms[rId].maxPlayers === mode) {
                        joined = await joinRoomTransaction(rId, currentUserData, mode);
                        if (joined) { currentRoomId = rId; break; }
                    }
                }
            }
            if (!joined) currentRoomId = await createNewRoom(currentUserData, 'public', null, mode);
            enterGameRoom(mode);
        } catch (error) {
            console.error(error); alert("خطأ في الاتصال بالشبكة."); resetLobbyButtons();
        }
    });
}

// 3. إنشاء غرفة خاصة
if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', async () => {
        if (!currentUserData) return alert("جاري تحميل بياناتك...");
        btnCreateRoom.disabled = true;
        const mode = getSelectedMode();
        const roomCode = generateRoomCode();
        currentRoomId = await createNewRoom(currentUserData, 'private', roomCode, mode);
        alert(`تم إنشاء الغرفة (${mode} لاعبين)! شارك الرمز: ${roomCode}`);
        enterGameRoom(mode);
    });
}

// 4. الانضمام لغرفة خاصة
if (btnJoinRoomModal) {
    btnJoinRoomModal.addEventListener('click', async () => {
        if (!currentUserData) return alert("جاري تحميل بياناتك...");
        const codeInput = prompt("🔑 أدخل رمز الغرفة (6 أحرف/أرقام):");
        if (!codeInput) return;
        const code = codeInput.trim().toUpperCase();
        if (code.length !== 6) return alert("رمز غير صحيح.");

        btnJoinRoomModal.disabled = true;
        const roomSnapshot = await rtdb.ref(`rooms/${code}`).once('value');
        if (!roomSnapshot.exists()) { alert("الغرفة غير موجودة!"); resetLobbyButtons(); return; }
        
        const mode = roomSnapshot.val().maxPlayers || 4;
        const joined = await joinRoomTransaction(code, currentUserData, mode);
        
        if (joined) {
            currentRoomId = code; enterGameRoom(mode);
        } else {
            alert("الغرفة ممتلئة أو بدأت بالفعل!"); resetLobbyButtons();
        }
    });
}

// ==========================================================================
// دوال قواعد البيانات والانتقال
// ==========================================================================
async function joinRoomTransaction(roomId, userData, mode) {
    const roomRef = rtdb.ref(`rooms/${roomId}`);
    let isSuccess = false; let joinedColor = null;
    await roomRef.transaction((room) => {
        if (room && room.status === 'waiting' && room.playerCount < room.maxPlayers) {
            if (room.players && room.players[userData.uid]) return; 
            const colors = mode === 2 ? ['red', 'yellow'] : ['red', 'green', 'yellow', 'blue'];
            const currentPlayers = room.players ? Object.keys(room.players).length : 0;
            const assignedColor = colors[currentPlayers];
            if (!room.players) room.players = {};
            room.players[userData.uid] = { name: userData.name, playerId: userData.playerId, color: assignedColor };
            room.playerCount++;
            if (room.playerCount === room.maxPlayers) room.status = 'playing';
            joinedColor = assignedColor;
            return room; 
        } return;
    }).then(res => { if (res.committed && joinedColor) { isSuccess = true; myPlayerColor = joinedColor; } });
    return isSuccess;
}

async function createNewRoom(userData, type, specificCode, mode) {
    const roomId = specificCode || generateRoomCode();
    myPlayerColor = 'red'; 
    await rtdb.ref(`rooms/${roomId}`).set({
        roomId: roomId, type: type, status: 'waiting', maxPlayers: mode, playerCount: 1, owner: userData.uid, currentTurn: 'red',
        players: { [userData.uid]: { name: userData.name, playerId: userData.playerId, color: myPlayerColor } }
    });
    return roomId;
}

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; let code = "";
    for(let i=0; i<6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function enterGameRoom(mode) {
    if (lobbyScreen) { lobbyScreen.classList.remove('active'); lobbyScreen.classList.add('hidden'); }
    if (gameScreen) gameScreen.classList.remove('hidden');
    if (typeof NetworkManager !== 'undefined') NetworkManager.init(currentRoomId, myPlayerColor);
    if (typeof LudoController !== 'undefined') LudoController.init(mode, false); 
    setTimeout(resetLobbyButtons, 1000);
}

function resetLobbyButtons() {
    if (btnQuickMatch) { btnQuickMatch.innerText = "▶ لعب سريع"; btnQuickMatch.disabled = false; }
    if (btnCreateRoom) btnCreateRoom.disabled = false;
    if (btnJoinRoomModal) { btnJoinRoomModal.innerText = "انضمام 🔑"; btnJoinRoomModal.disabled = false; }
}
