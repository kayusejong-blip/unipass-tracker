// AG Bot - Backend API Server + Real-time Checker (v2.3)
// 대장님, 실시간 조회 엔진을 서버에 합체했습니다!

const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const PORT = 3000;
const BL_LIST_PATH = path.join(__dirname, 'data', 'bl_list.json');
const HISTORY_PATH = path.join(__dirname, 'data', 'status_history.json');

const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
};

// [v3.0] 유니패스 오픈 API 실시간 조회 함수 (API001 연동)
// 대장님, 이제 크롤링이 아닌 공식 API를 사용하여 속도와 안정성이 대폭 향상되었습니다!
const fetchStatusFromUnipass = async (hblNo) => {
    try {
        const apiKey = process.env.UNIPASS_API_KEY || 'r240a266b083p361j040i080z0';
        const blYy = new Date().getFullYear();
        
        // Uni-pass Open API 호출 (API001: 화물통관진행정보조회)
        const url = `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`;
        
        console.log(`[API 호출] ${hblNo} (${blYy}) ...`);
        const response = await axios.get(url, {
            params: {
                crkyCn: apiKey,
                hblNo: hblNo,
                blYy: blYy.toString()
            }
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        
        // 1. 기본 정보 추출 (XML 태그 기준)
        const cargoMtNo = $('cargMtNo').first().text() || '확인불가';
        const currentStatus = ($('csclPrgsStts').first().text() || $('prgsStts').first().text() || '정보 없음').trim();
        const itemName = $('prnm').first().text() || '품명 미확인';
        const location = $('dsprNm').first().text() || '위치 미확인';
        let weight = $('msrm').first().text() || '확인 불가';
        let count = $('pckGcnt').first().text() || '확인 불가';
        
        // [v3.5] 추가 상세 정보 추출 (수송 및 규격 정보 대폭 확장)
        const shipNm = $('shcoFlNm').first().text() || $('shipNm').first().text() || '확인불가'; 
        const voyageNo = $('vydf').first().text() || '-'; 
        const shipNat = $('shipNatNm').first().text() || $('shipNat').first().text() || '-'; 
        const lodPort = $('ldprNm').first().text() || $('lodPortNm').first().text() || '-';
        const dsprPort = $('dsprNm').first().text() || '-'; 
        const etprDt = $('etprDt').first().text() || '-'; 
        const msrm = $('msrm').first().text() || '-'; 
        const ttwg = $('ttwg').first().text() || '-'; 
        const cntrGcnt = $('cntrGcnt').first().text() || '0'; 

        // 새롭게 추출하는 세부 물류 정보
        const mblNo = $('mblNo').first().text() || '-'; // Master BL
        const cargMtNo = $('cargMtNo').first().text() || '-'; // 화물관리번호
        const cargTp = $('cargTp').first().text() || '-'; // 화물구분
        const blPtNm = $('blPtNm').first().text() || '-'; // BL유형(Consol 등)
        const shcoFlco = $('shcoFlco').first().text() || '-'; // 선사/항공사
        const frwrEntsConm = $('frwrEntsConm').first().text() || '-'; // 포워더
        const cntrNo = $('cntrNo').first().text() || '-'; // 컨테이너번호
        const etprCstm = $('etprCstm').first().text() || '-'; // 입항세관
        
        weight = ttwg + ' ' + ($('wghtUt').first().text() || 'KG');
        count = ($('pckGcnt').first().text() || '0') + ' ' + ($('pckUt').first().text() || 'PK');

        // 시간 포맷팅 (ETA: YYYYMMDD -> YYYY-MM-DD)
        const formattedEta = etprDt.length === 8 ? `${etprDt.substring(0,4)}-${etprDt.substring(4,6)}-${etprDt.substring(6,8)}` : etprDt;

        // 2. 타임라인 (이력) 추출
        const stages = [];
        $('cargCsclPrgsInfoDtlQryVo').each((i, el) => {
            const step = $(el).find('cargTrcStepNm').text().trim();
            const time = $(el).find('prcsDttm').text().trim();
            const desc = $(el).find('shedNm').text().trim() || '관세청 처리';
            
            if (step && time) {
                // 시간 포맷팅 (YYYYMMDDHHMMSS -> YYYY-MM-DD HH:MM:SS)
                const formattedTime = `${time.substring(0,4)}-${time.substring(4,6)}-${time.substring(6,8)} ${time.substring(8,10)}:${time.substring(10,12)}:${time.substring(12,14)}`;
                stages.push({
                    date: formattedTime,
                    title: step,
                    desc: desc
                });
            }
        });

        const lastDate = stages.length > 0 ? stages[0].date : new Date().toLocaleString();

        // 결과 저장 및 히스토리 업데이트 (새 필드 포함)
        if (currentStatus !== '정보 없음' && !currentStatus.includes('조회 결과')) {
            const history = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH)) : {};
            history[hblNo] = {
                status: currentStatus,
                itemName: itemName,
                lastChecked: new Date().toISOString(),
                lastProcessDate: lastDate,
                extra: { shipNm, voyageNo, shipNat, lodPort, dsprPort, eta: formattedEta, msrm, ttwg, cntrGcnt, mblNo, cargMtNo, cargTp, blPtNm, shcoFlco, frwrEntsConm, cntrNo, etprCstm }
            };
            fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
        }

        return {
            number: hblNo,
            currentStatus,
            itemName,
            location,
            lastProcessDate: lastDate,
            weight,
            count,
            extra: { 
                shipNm, voyageNo, shipNat, lodPort, dsprPort, 
                eta: formattedEta, msrm, ttwg, cntrGcnt,
                mblNo, cargMtNo, cargTp, blPtNm, shcoFlco, frwrEntsConm, cntrNo, etprCstm
            },
            stages: stages.length > 0 ? stages : [
                { date: lastDate, title: currentStatus, desc: `${location}에서 처리되었습니다.` }
            ]
        };
    } catch (e) {
        console.error(`Check Error [${hblNo}]:`, e.message);
        throw e;
    }
};

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, HEADERS);
        res.end();
        return;
    }

    // 1. BL 목록 조회 (GET /api/bls)
    if (req.url === '/api/bls' && req.method === 'GET') {
        const data = fs.existsSync(BL_LIST_PATH) ? fs.readFileSync(BL_LIST_PATH, 'utf-8') : '[]';
        res.writeHead(200, HEADERS);
        res.end(data);
        return;
    }

    // 2. BL 목록 업데이트 (POST /api/bls)
    if (req.url === '/api/bls' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                fs.writeFileSync(BL_LIST_PATH, body);
                res.writeHead(200, HEADERS);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, HEADERS);
                res.end(JSON.stringify({ error: 'Invalid Body' }));
            }
        });
        return;
    }

    // 3. 엔진 히스토리 조회 (GET /api/history)
    if (req.url === '/api/history' && req.method === 'GET') {
        const data = fs.existsSync(HISTORY_PATH) ? fs.readFileSync(HISTORY_PATH, 'utf-8') : '{}';
        res.writeHead(200, HEADERS);
        res.end(data);
        return;
    }

    // 4. 즉시 조회 기능 (POST /api/check)
    if (req.url.startsWith('/api/check') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { number } = JSON.parse(body);
                console.log(`[즉시조회] ${number} 요청됨...`);
                const result = await fetchStatusFromUnipass(number);
                res.writeHead(200, HEADERS);
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(500, HEADERS);
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404, HEADERS);
    res.end(JSON.stringify({ error: 'Not Found' }));
});

// [v3.3] 실시간 상태 모니터링 루프 (Background Monitor)
// 대장님, 서버가 켜져 있는 동안 30분마다 자동으로 상태를 체크하여 텔레그램으로 보고합니다!
const TG_TOKEN = process.env.TG_TOKEN || '8599634247:AAFxtif1sMu1yqibBBR7Ce1m3Q_SKWKS4i8';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '5826246844';

const sendTelegram = async (message) => {
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log(`[${new Date().toLocaleString()}] Telegram Alarm Sent.`);
    } catch (e) {
        console.error('Telegram Error:', e.message);
    }
};

const backgroundCheck = async () => {
    console.log(`[${new Date().toLocaleString()}] Background Monitoring Start...`);
    try {
        if (!fs.existsSync(BL_LIST_PATH)) return;
        const blList = JSON.parse(fs.readFileSync(BL_LIST_PATH));
        const historyData = fs.existsSync(HISTORY_PATH) ? JSON.parse(fs.readFileSync(HISTORY_PATH)) : {};

        for (const hblNo of blList) {
            try {
                const result = await fetchStatusFromUnipass(hblNo);
                const prevStatus = historyData[hblNo] ? (historyData[hblNo].status || historyData[hblNo]) : null;

                // 상태가 변경되었을 때만 알림
                if (result.currentStatus && result.currentStatus !== '정보 없음' && result.currentStatus !== prevStatus) {
                    const msg = `🚀 <b>[화물 상태 변경]</b>\n\n번호: <code>${hblNo}</code>\n품명: ${result.itemName || '-'}\n이전: ${prevStatus || '신규 등록'}\n👉 <b>현재: ${result.currentStatus}</b>\n\n📍 위치: ${result.location || '-'}\n\n<a href="https://unipass.customs.go.kr/csp/index.do">유니패스에서 자세히 보기</a>`;
                    await sendTelegram(msg);
                }
            } catch (err) {
                console.error(`Check failed for [${hblNo}]:`, err.message);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        console.log(`[${new Date().toLocaleString()}] Background Monitoring Done.`);
    } catch (e) {
        console.error('Background loop error:', e.message);
    }
};

server.listen(PORT, () => {
    console.log(`\n================================================`);
    console.log(`🚀 AG-Bot Dashboard Server v3.5 Running`);
    console.log(`🛰️ Background Monitor: Active (Every 10m)`);
    console.log(`📬 Telegram Bot: Connected (${TG_TOKEN.substring(0,10)}...)`);
    console.log(`================================================\n`);
    
    // 초기 5초 후 즉시 체크 시작
    setTimeout(backgroundCheck, 5000);
    // 모니터링 주기 설정 (기본 10분)
    const intervalMs = process.env.CHECK_INTERVAL || 600000;
    setInterval(backgroundCheck, intervalMs);
});
