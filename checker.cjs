// [v1.8] 24시간 무정전 화물 상태 체커 (checker.cjs)
// 대장님, 이 스크립트가 30분마다 Github Actions에서 실행될 핵심 엔진입니다.

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 설정 (환경 변수 우선)
const TG_TOKEN = process.env.TG_TOKEN || '';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '5826246844';
const BL_LIST_PATH = path.join(__dirname, 'data', 'bl_list.json');
const HISTORY_PATH = path.join(__dirname, 'data', 'status_history.json');

// 텔레그램 알림 발송 함수
const sendTelegram = async (message) => {
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('Telegram notification sent.');
    } catch (e) {
        console.error('Telegram Error:', e.message);
    }
};

// [v3.0] 유니패스 오픈 API 조회 함수 (API001)
const fetchStatus = async (hblNo) => {
    try {
        const apiKey = process.env.UNIPASS_API_KEY || 'r240a266b083p361j040i080z0';
        const blYy = new Date().getFullYear();
        
        const url = `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`;
        
        const response = await axios.get(url, {
            params: {
                crkyCn: apiKey,
                hblNo: hblNo,
                blYy: blYy.toString()
            }
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        const currentStatus = ($('csclPrgsStts').first().text() || $('prgsStts').first().text() || '정보 없음').trim();
        
        if (currentStatus && currentStatus !== '정보 없음') {
            return {
                status: currentStatus,
                raw: response.data
            };
        }
        return { status: '미등록/조회실패', raw: null };

    } catch (e) {
        console.error(`Fetch Error [${hblNo}]:`, e.message);
        return { status: '에러 발생', raw: null };
    }
};

// 메인 실행 로직
const run = async () => {
    console.log(`[${new Date().toLocaleString()}] Cargo Check Start...`);

    // 1. BL 목록 로드
    if (!fs.existsSync(BL_LIST_PATH)) {
        console.log('No BL list found. Creating default...');
        fs.mkdirSync(path.dirname(BL_LIST_PATH), { recursive: true });
        fs.writeFileSync(BL_LIST_PATH, JSON.stringify(['2603100206']));
    }
    const blList = JSON.parse(fs.readFileSync(BL_LIST_PATH));

    // 2. 히스토리 로드
    let history = {};
    if (fs.existsSync(HISTORY_PATH)) {
        history = JSON.parse(fs.readFileSync(HISTORY_PATH));
    }

    // 3. 각 BL 체크
    for (const hblNo of blList) {
        const result = await fetchStatus(hblNo);
        const prevStatus = history[hblNo] ? history[hblNo].status : '대기';

        console.log(`BL: ${hblNo} | Current: ${result.status} | Previous: ${prevStatus}`);

        // 상태가 변경되었을 때만 알림
        if (result.status !== prevStatus && result.status !== '에러 발생') {
            const msg = `📬 <b>화물 상태 변경 알림</b>\n\n번호: <code>${hblNo}</code>\n이전: ${prevStatus}\n👉 <b>현재: ${result.status}</b>\n\n<a href="https://unipass.customs.go.kr/csp/index.do">유니패스에서 자세히 보기</a>`;
            await sendTelegram(msg);
            
            // 히스토리 업데이트
            history[hblNo] = {
                status: result.status,
                lastChecked: new Date().toISOString()
            };
        }
    }

    // 4. 결과 저장
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log('Check finished & History saved.');
};

run();
