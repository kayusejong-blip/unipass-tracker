const axios = require('axios');
const TG_TOKEN = process.env.TG_TOKEN || '8599634247:AAFxtif1sMu1yqibBBR7Ce1m3Q_SKWKS4i8';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '5826246844';

const testTelegram = async () => {
    try {
        console.log(`[테스트 발송 시작] Telegram 발송 중...`);
        const message = `🚀 <b>[시스템 알림]</b>\n\n대장님! 안티그래비티 텔레그램 연동 테스트 메시지입니다.\n서버에서 발송하는 알림이 정상적으로 수신되고 있습니다! 🫡`;
        
        const response = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        
        if (response.data.ok) {
            console.log(`✅ 발송 성공! Telegram 메시지를 확인해주세요.`);
        } else {
            console.log(`❌ 발송 실패:`, response.data.description);
        }
    } catch (e) {
        console.error('Telegram Error:', e.response ? e.response.data : e.message);
    }
};

testTelegram();
