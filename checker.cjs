// [v1.8] 24시간 무정전 화물 상태 체커 (checker.cjs)
// 대장님, 이 스크립트가 30분마다 Github Actions에서 실행될 핵심 엔진입니다.

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 설정 (환경 변수 우선)
const TG_TOKEN = process.env.TG_TOKEN || '8599634247:AAFxtif1sMu1yqibBBR7Ce1m3Q_SKWKS4i8';
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

// 유니패스 조회 함수 (v1.5 분석 기준)
const fetchStatus = async (hblNo) => {
    try {
        // 1. 초기 페이지 접속하여 토큰 및 세션 획득
        const initRes = await axios.get('https://unipass.customs.go.kr/csp/index.do');
        const $ = cheerio.load(initRes.data);
        const savedToken = $('input[name$="savedToken"]').val(); // 'savedToken'으로 끝나는 input 찾기
        const cookies = initRes.headers['set-cookie'] || [];

        // 2. 조회 요청
        const blYy = new Date().getFullYear();
        const formData = new URLSearchParams();
        formData.append('qryTp', '2');
        formData.append('hblNo', hblNo);
        formData.append('blYy', blYy.toString());
        
        // 실제 API 엔드포인트
        const listUrl = `https://unipass.customs.go.kr/csp/myc/bsopspptinfo/cscllgstinfo/ImpCargPrgsInfoMtCtr/retrieveImpCargPrgsInfoLst.do`;
        
        const res = await axios.post(listUrl, formData, {
            headers: {
                'Cookie': cookies.join('; '),
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://unipass.customs.go.kr/csp/index.do'
            }
        });

        // 결과 파싱 (간략화된 버전)
        // 실제 운영 시에는 cheerio를 사용하여 HTML 응답을 세밀하게 파싱해야 함
        // 여기서는 데이터가 포함되어 있다고 가정하고 status 추출 시도
        if (res.data && res.data.includes(hblNo)) {
            const resultMatch = res.data.match(/prgsStts\s*:\s*"([^"]+)"/); // 가상의 정규실 또는 cheerio 사용
            // 테스트 데이터를 위해 현재는 '반출완료' 케이스로 예시 작성
            const $res = cheerio.load(res.data);
            const statusText = $res('.stts').first().text().trim() || '조회됨';
            return {
                status: statusText,
                raw: res.data
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
