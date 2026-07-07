// ==========================================================================
// ملف game.js - محرك اللعبة الشامل (النسخة الاحترافية الموسعة بالكامل)
// حل مشكلة تجميد دور الكمبيوتر 🤖 وتصحيح تمرير قفل الأمان
// ==========================================================================

/**
 * @class LudoConfig
 * @description الإحداثيات الرياضية المطلقة للوحة اللعب (15x15 Grid)
 */
class LudoConfig {
    static TEAMS = ['red', 'green', 'yellow', 'blue'];
    
    // مراكز الحفر داخل القواعد بدقة متناهية (Anti-Skew Math)
    static BASE_HOLES = {
        red:    [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
        green:  [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
        yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
        blue:   [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]]
    };

    // المسار الخارجي المشترك (52 خطوة)
    static COMMON_PATH = [
        [6,1],[6,2],[6,3],[6,4],[6,5], [5,6],[4,6],[3,6],[2,6],[1,6],[0,6], [0,7],[0,8], // مسار الأحمر
        [1,8],[2,8],[3,8],[4,8],[5,8], [6,9],[6,10],[6,11],[6,12],[6,13],[6,14], [7,14],[8,14], // مسار الأخضر
        [8,13],[8,12],[8,11],[8,10],[8,9], [9,8],[10,8],[11,8],[12,8],[13,8],[14,8], [14,7],[14,6], // مسار الأصفر
        [13,6],[12,6],[11,6],[10,6],[9,6], [8,5],[8,4],[8,3],[8,2],[8,1],[8,0], [7,0],[6,0] // مسار الأزرق
    ];

    // بيانات الفِرَق (نقاط الدخول، مسارات الفوز، الألوان)
    static TEAM_DATA = {
        red:    { startIdx: 0,  homeEntryIdx: 50, homePath: [[7,1],[7,2],[7,3],[7,4],[7,5], [7,6]], colorHex: '#E53935', name: 'الأحمر' },
        green:  { startIdx: 13, homeEntryIdx: 11, homePath: [[1,7],[2,7],[3,7],[4,7],[5,7], [6,7]], colorHex: '#43A047', name: 'الأخضر' },
        yellow: { startIdx: 26, homeEntryIdx: 24, homePath: [[7,13],[7,12],[7,11],[7,10],[7,9], [7,8]], colorHex: '#FDD835', name: 'الأصفر' },
        blue:   { startIdx: 39, homeEntryIdx: 37, homePath: [[13,7],[12,7],[11,7],[10,7],[9,7], [8,7]], colorHex: '#1E88E5', name: 'الأزرق' }
    };

    // النجوم (مناطق الأمان)
    static SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];
}

class MapEngine {
    static getPercentPos(r, c) {
        const cellSize = 100 / 15;
        return { 
            top: (r * cellSize) + (cellSize / 2), 
            left: (c * cellSize) + (cellSize / 2) 
        };
    }
}

class BoardRenderer {
    static drawBoard() {
        const grid = document.getElementById('grid-layer');
        const holesLayer = document.getElementById('holes-layer');
        
        grid.innerHTML = '';
        holesLayer.innerHTML = '';

        for (let r = 0; r < 15; r++) {
            for (let c = 0; c < 15; c++) {
                let cell = document.createElement('div');
                cell.className = 'cell';
                
                if (r === 7 && c >= 1 && c <= 5) cell.style.background = 'var(--ludo-red)';
                if (c === 7 && r >= 1 && r <= 5) cell.style.background = 'var(--ludo-green)';
                if (r === 7 && c >= 9 && c <= 13) cell.style.background = 'var(--ludo-yellow)';
                if (c === 7 && r >= 9 && r <= 13) cell.style.background = 'var(--ludo-blue)';

                const isStar = (r==6&&c==1) || (r==1&&c==8) || (r==8&&c==13) || (r==13&&c==6) || (r==2&&c==6) || (r==6&&c==12) || (r==12&&c==8) || (r==8&&c==2);
                if (isStar) cell.classList.add('safe-star');
                
                if ((r<6 && c<6) || (r<6 && c>8) || (r>8 && c<6) || (r>8 && c>8)) cell.style.border = 'none';
                
                grid.appendChild(cell);
            }
        }

        LudoConfig.TEAMS.forEach(team => {
            LudoConfig.BASE_HOLES[team].forEach(coords => {
                let hole = document.createElement('div');
                hole.className = 'base-hole';
                let pos = MapEngine.getPercentPos(coords[0], coords[1]);
                hole.style.top = `${pos.top}%`; 
                hole.style.left = `${pos.left}%`;
                holesLayer.appendChild(hole);
            });
        });
    }
}

class Pawn {
    constructor(id, team, baseIndex) {
        this.id = id; 
        this.team = team; 
        this.baseIndex = baseIndex;
        this.state = 'BASE';
        this.positionIndex = -1;
        this.element = this.createDOMElement();
        this.updateVisualPosition();
    }

    createDOMElement() {
        const div = document.createElement('div'); 
        div.className = `pawn ${this.team}`; 
        div.id = this.id;
        
        div.onclick = () => LudoController.handlePawnClick(this);
        
        document.getElementById('pawns-layer').appendChild(div); 
        return div;
    }

    updateVisualPosition(offsetX = 0, offsetY = 0, scale = 1) {
        if (this.state === 'FINISHED') {
            this.element.style.display = 'none';
            return;
        }

        let r, c;
        if (this.state === 'BASE') {
            [r, c] = LudoConfig.BASE_HOLES[this.team][this.baseIndex];
        } else if (this.state === 'COMMON') {
            [r, c] = LudoConfig.COMMON_PATH[this.positionIndex];
        } else if (this.state === 'HOME') {
            [r, c] = LudoConfig.TEAM_DATA[this.team].homePath[this.positionIndex];
        }

        const pos = MapEngine.getPercentPos(r, c);
        
        this.element.style.top = `calc(${pos.top}% + ${offsetY}px)`;
        this.element.style.left = `calc(${pos.left}% + ${offsetX}px)`;
        this.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    highlight(enable) {
        if (enable) this.element.classList.add('highlight');
        else this.element.classList.remove('highlight');
    }
}

class LudoController {
    static pawns = {};
    static state = 'WAITING_FOR_ROLL'; 
    static currentTurn = 'red';
    static moveQueue = []; 
    static consecutiveSixes = 0;
    static isProcessing = false;
    
    // متغيرات الأنماط المشاركة
    static gameMode = 4;
    static isAI = false;
    static activeTeams = ['red', 'green', 'yellow', 'blue'];

    static init(mode = 4, isAI = false) {
        this.gameMode = mode;
        this.isAI = isAI;
        
        // تحديد مصفوفة الفرق (لو 2 لاعبين أحمر وأصفر متقابلين)
        this.activeTeams = mode === 2 ? ['red', 'yellow'] : ['red', 'green', 'yellow', 'blue'];
        
        BoardRenderer.drawBoard();
        document.getElementById('pawns-layer').innerHTML = '';
        this.pawns = {};
        
        this.activeTeams.forEach(team => { 
            for(let i=0; i<4; i++) {
                const pawnId = `${team}-${i}`;
                this.pawns[pawnId] = new Pawn(pawnId, team, i); 
            }
        });
        
        this.currentTurn = 'red';
        this.state = 'WAITING_FOR_ROLL';
        this.moveQueue = [];
        this.consecutiveSixes = 0;
        this.isProcessing = false;
        
        this.updateUI();
    }

    // [التعديل الجوهري هنا]: إضافة بارامتر لمعرفة هل الرمي قادم من الكمبيوتر تلقائياً أم ضغطة ماوس بشرية
    static rollDice(isAIInvoke = false) {
        if (this.state !== 'WAITING_FOR_ROLL' || this.isProcessing) return;
        
        // منع البشر من التلاعب والضغط بالماوس في دور الكمبيوتر
        if (this.isAI && this.currentTurn !== myPlayerColor && !isAIInvoke) {
            console.log("حظر نقرة بشرية غير مصرح بها في دور البوت.");
            return;
        }
        
        // في نمط الأونلاين ضد لاعبين حقيقيين
        if (!this.isAI && typeof myPlayerColor !== 'undefined' && this.currentTurn !== myPlayerColor) {
            return;
        }

        this.isProcessing = true;
        this.state = 'ROLLING';
        
        const diceResult = Math.floor(Math.random() * 6) + 1;
        
        if (!this.isAI && typeof NetworkManager !== 'undefined' && NetworkManager.isReady) {
            NetworkManager.sendDiceRoll(diceResult);
        } else {
            this.showDiceAnimation(diceResult);
        }
    }

    static showDiceAnimation(result) {
        const diceElement = document.getElementById('main-dice');
        if (diceElement) diceElement.classList.add('rolling');
        
        Object.values(this.pawns).forEach(p => p.highlight(false));
        
        setTimeout(() => {
            if (diceElement) {
                diceElement.classList.remove('rolling');
                const transforms = {
                    1: 'rotateX(0deg) rotateY(0deg)', 6: 'rotateX(180deg) rotateY(0deg)',
                    3: 'rotateX(0deg) rotateY(-90deg)', 4: 'rotateX(0deg) rotateY(90deg)',
                    5: 'rotateX(-90deg) rotateY(0deg)', 2: 'rotateX(90deg) rotateY(0deg)'
                };
                diceElement.style.transform = transforms[result];
            }
            this.processDiceResult(result);
        }, 600);
    }

    static processDiceResult(result) {
        this.isProcessing = false;
        
        if (result === 6) {
            this.consecutiveSixes++;
            if (this.consecutiveSixes === 3) {
                this.moveQueue = []; 
                this.consecutiveSixes = 0; 
                this.passTurn(); 
                return;
            }
            this.moveQueue.push(6); 
            this.state = 'WAITING_FOR_ROLL';
        } else {
            this.moveQueue.push(result); 
            this.consecutiveSixes = 0; 
            this.state = 'WAITING_FOR_MOVE';
            this.evaluatePlayablePawns();
        }
        
        this.updateUI();
        
        // إذا كان البوت يملك رمية إضافية (جلب رقم 6)، يستمر بالرمي تلقائياً مع تفعيل الإذن true
        if (this.isAI && this.currentTurn !== myPlayerColor && this.state === 'WAITING_FOR_ROLL') {
            setTimeout(() => this.rollDice(true), 1000);
        }
    }

    static evaluatePlayablePawns() {
        if (this.moveQueue.length === 0) { 
            this.passTurn(); 
            return; 
        }

        const currentSteps = this.moveQueue[0];
        let playableCount = 0; 
        let autoPlayablePawn = null;
        let aiPlayablePawns = []; 

        Object.values(this.pawns).forEach(pawn => {
            pawn.highlight(false);
            if (pawn.team !== this.currentTurn) return;

            let canMove = false;
            if (pawn.state === 'BASE' && currentSteps === 6) canMove = true;
            if (pawn.state === 'COMMON') {
                let distanceToHome = this.getDistanceToHome(pawn);
                if (distanceToHome >= currentSteps) canMove = true;
            }
            if (pawn.state === 'HOME' && (pawn.positionIndex + currentSteps) <= 5) canMove = true;

            if (canMove) { 
                if (this.currentTurn === myPlayerColor) {
                    pawn.highlight(true); 
                }
                playableCount++; 
                autoPlayablePawn = pawn; 
                aiPlayablePawns.push(pawn);
            }
        });

        if (playableCount === 0) {
            this.moveQueue.shift(); 
            this.evaluatePlayablePawns();
        } 
        else if (playableCount === 1 && this.currentTurn === myPlayerColor) {
            setTimeout(() => this.handlePawnClick(autoPlayablePawn), 400);
        }
        else if (this.isAI && this.currentTurn !== myPlayerColor) {
            // تفكير وبناء قرار الكمبيوتر (AI Strategy)
            setTimeout(() => {
                let chosenPawn = aiPlayablePawns[Math.floor(Math.random() * aiPlayablePawns.length)];
                
                if (currentSteps === 6) {
                    const basePawn = aiPlayablePawns.find(p => p.state === 'BASE');
                    if (basePawn) chosenPawn = basePawn; // أولوية الخروج
                } else {
                    const homePawn = aiPlayablePawns.find(p => p.state === 'HOME' && p.positionIndex + currentSteps === 5);
                    if (homePawn) chosenPawn = homePawn; // أولوية التسكين داخل الهدف
                }

                chosenPawn.element.classList.add('highlight'); // إضاءة وهمية لتخطي قفل الأمان
                this.handlePawnClick(chosenPawn);
            }, 800);
        }
    }

    static getDistanceToHome(pawn) {
        const teamData = LudoConfig.TEAM_DATA[pawn.team];
        if (pawn.positionIndex <= teamData.homeEntryIdx) return teamData.homeEntryIdx - pawn.positionIndex + 6;
        return (51 - pawn.positionIndex) + teamData.homeEntryIdx + 6;
    }

    static handlePawnClick(pawn) {
        if (this.state !== 'WAITING_FOR_MOVE' || this.isProcessing) return;
        if (!pawn.element.classList.contains('highlight')) return;
        
        if (!this.isAI || this.currentTurn === myPlayerColor) {
            if (typeof myPlayerColor !== 'undefined' && pawn.team !== myPlayerColor) return;
        }

        this.isProcessing = true; 
        this.state = 'ANIMATING';
        const steps = this.moveQueue.shift();
        Object.values(this.pawns).forEach(p => p.highlight(false));

        if (!this.isAI && typeof NetworkManager !== 'undefined' && NetworkManager.isReady) {
            NetworkManager.sendPawnMove(pawn.id, steps);
        } else {
            this.executePawnMove(pawn.id, steps);
        }
    }

    static executePawnMove(pawnId, steps) {
        this.state = 'ANIMATING';
        const pawn = this.pawns[pawnId];

        if (pawn.state === 'BASE' && steps === 6) {
            pawn.state = 'COMMON'; 
            pawn.positionIndex = LudoConfig.TEAM_DATA[pawn.team].startIdx;
            this.finalizeMove(pawn); 
            return;
        }

        let stepsTaken = 0;
        const interval = setInterval(() => {
            if (stepsTaken >= steps) {
                clearInterval(interval);
                this.finalizeMove(pawn); 
                return;
            }

            if (pawn.state === 'COMMON') {
                if (pawn.positionIndex === LudoConfig.TEAM_DATA[pawn.team].homeEntryIdx) {
                    pawn.state = 'HOME'; 
                    pawn.positionIndex = 0;
                } else {
                    pawn.positionIndex = pawn.positionIndex === 51 ? 0 : pawn.positionIndex + 1;
                }
            } else if (pawn.state === 'HOME') {
                pawn.positionIndex++;
            }

            pawn.updateVisualPosition();
            stepsTaken++;
        }, 150);
    }

    static finalizeMove(movedPawn) {
        this.isProcessing = false; 
        let rewardRoll = false;

        // الأكل والالتهام
        if (movedPawn.state === 'COMMON' && !LudoConfig.SAFE_ZONES.includes(movedPawn.positionIndex)) {
            let enemies = Object.values(this.pawns).filter(p => p.team !== movedPawn.team && p.state === 'COMMON' && p.positionIndex === movedPawn.positionIndex);
            
            if (enemies.length > 0) {
                enemies.forEach(e => { 
                    e.state = 'BASE'; 
                    e.positionIndex = -1; 
                    e.updateVisualPosition(); 
                });
                rewardRoll = true; 
            }
        }

        // تسجيل هدف الفوز لبيدق واحد
        if (movedPawn.state === 'HOME' && movedPawn.positionIndex === 5) {
            movedPawn.state = 'FINISHED';
            movedPawn.updateVisualPosition();
            rewardRoll = true;

            const myPawns = Object.values(this.pawns).filter(p => p.team === movedPawn.team);
            const finishedCount = myPawns.filter(p => p.state === 'FINISHED').length;
            
            if (finishedCount === 4) {
                if (!this.isAI && typeof NetworkManager !== 'undefined' && NetworkManager.isReady) {
                    NetworkManager.sendWinEvent(movedPawn.team);
                } else if (this.isAI) {
                    alert(`🏆 نهاية المباراة! الفائز هو الفريق: ${LudoConfig.TEAM_DATA[movedPawn.team].name}`);
                    window.location.reload(); 
                }
                return; 
            }
        }

        this.recalculateStacking();

        if (rewardRoll) {
            this.state = 'WAITING_FOR_ROLL'; 
        } 
        else if (this.moveQueue.length > 0) { 
            this.state = 'WAITING_FOR_MOVE'; 
            this.evaluatePlayablePawns(); 
        } 
        else { 
            this.passTurn(); 
        }
        
        this.updateUI();
        
        // تشغيل البوت عند الفوز برمية مكافأة مع حزمة تمرير الإذن true
        if (this.isAI && this.currentTurn !== myPlayerColor && this.state === 'WAITING_FOR_ROLL') {
            setTimeout(() => this.rollDice(true), 1000);
        }
    }

    static recalculateStacking() {
        let tiles = {};
        
        Object.values(this.pawns).forEach(p => {
            if (p.state !== 'COMMON' && p.state !== 'HOME') return;
            let key = `${p.state}_${p.positionIndex}`;
            if (!tiles[key]) tiles[key] = []; 
            tiles[key].push(p);
        });

        Object.values(tiles).forEach(group => {
            if (group.length === 1) {
                group[0].updateVisualPosition(0, 0, 1);
            } else {
                const offsets = [ {x: -10, y: -10}, {x: 10, y: 10}, {x: -10, y: 10}, {x: 10, y: -10} ];
                group.forEach((p, idx) => p.updateVisualPosition(offsets[idx % 4].x, offsets[idx % 4].y, 0.75));
            }
        });
    }

    static passTurn() {
        if (!this.isAI && typeof NetworkManager !== 'undefined' && NetworkManager.isReady && this.currentTurn === myPlayerColor) {
            NetworkManager.sendNextTurn();
        } else {
            this.setNextTurnLocally();
        }
    }

    static setNextTurnLocally(specificTurn = null) {
        if (specificTurn) {
            this.currentTurn = specificTurn;
        } else {
            const index = this.activeTeams.indexOf(this.currentTurn);
            this.currentTurn = this.activeTeams[(index + 1) % this.activeTeams.length];
        }
        
        this.state = 'WAITING_FOR_ROLL'; 
        this.consecutiveSixes = 0; 
        this.updateUI();

        // [التحديث الحاسم]: تمرير true لتخطي قفل واجهة الماوس وتشغيل الكمبيوتر فوراً في دوره
        if (this.isAI && this.currentTurn !== myPlayerColor) {
            setTimeout(() => this.rollDice(true), 1200);
        }
    }

    static updateUI() {
        const turnDisplay = document.getElementById('turn-display');
        if (!turnDisplay) return;
        
        const teamData = LudoConfig.TEAM_DATA[this.currentTurn];
        let activePlayerName = teamData.name;
        
        if (this.isAI && this.currentTurn !== myPlayerColor) {
            activePlayerName = "الكمبيوتر 🤖";
        } else if (typeof NetworkManager !== 'undefined' && NetworkManager.roomData && NetworkManager.roomData.players) {
            for (let uid in NetworkManager.roomData.players) {
                if (NetworkManager.roomData.players[uid].color === this.currentTurn) {
                    activePlayerName = NetworkManager.roomData.players[uid].name;
                    break;
                }
            }
        }

        if (this.currentTurn === myPlayerColor) {
            turnDisplay.innerText = `دورك الآن! (ارمِ النرد)`;
        } else {
            turnDisplay.innerText = `دور: ${activePlayerName}`;
        }
        
        turnDisplay.style.color = teamData.colorHex;

        const queueDiv = document.getElementById('moves-queue'); 
        if (queueDiv) {
            queueDiv.innerHTML = '';
            this.moveQueue.forEach(move => {
                let badge = document.createElement('div'); 
                badge.className = 'move-badge';
                badge.innerText = move; 
                queueDiv.appendChild(badge);
            });
        }

        const displayNameEl = document.getElementById('display-name');
        if (displayNameEl && typeof currentUserData !== 'undefined' && currentUserData) {
            displayNameEl.innerText = currentUserData.name;
        }
    }
}

// تهيئة شكلية فارغة عند أول إقلاع للمتصفح
window.onload = () => {
    LudoController.init(4, false); 
};
