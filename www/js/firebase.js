// ==========================================================================
// ملف firebase.js - إعدادات الاتصال بخوادم Firebase
// ==========================================================================

const firebaseConfig = {
    apiKey: "AIzaSyCbaxN1HvGcAeYmVNEh5kxHKi8EDBBGlQU",
    authDomain: "test-project-4ec16.firebaseapp.com",
    databaseURL: "https://test-project-4ec16-default-rtdb.firebaseio.com",
    projectId: "test-project-4ec16",
    storageBucket: "test-project-4ec16.appspot.com",
    messagingSenderId: "234783667202",
    appId: "1:234783667202:android:1de19509c4e112d15ae31b"
};

// تهيئة تطبيق Firebase
firebase.initializeApp(firebaseConfig);

// تعريف المتغيرات العامة للوصول السريع للخدمات في جميع ملفات اللعبة
const auth = firebase.auth();
const db = firebase.firestore();      // للبيانات الثابتة (ملفات اللاعبين، الإحصائيات)
const rtdb = firebase.database();     // للمزامنة اللحظية (حالة الغرف، النرد، الحركة، والدردشة)
