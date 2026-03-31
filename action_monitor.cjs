const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// GitHub Secrets 로부터 환경변수 로딩
const UNIPASS_API_KEY = process.env.UNIPASS_API_KEY;
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const DATA_DIR = path.join(__dirname, 'data');
const BL_LIST_PATH = path.join(DATA_DIR, 'bl_list.json');
const HISTORY_PATH = path.join(DATA_DIR, 'status_history.json');

// --- 텔레그램 발송 ---
const sendTelegram = async (message) => {
    if (!TG_TOKEN || !TG_CHAT_ID) {
        console.error("TG_TOKEN or TG_CHAT_ID is missing from secrets. Skipping Telegram alert.");
        return;
    }
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: TG_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log(`Telegram sent: ${message.substring(0, 30)}...`);
    } catch (e) {
        console.error('Telegram Error:', e.message);
    }
};

// --- 유니패스 API 스크래퍼 ---
const fetchStatusFromUnipass = async (hblNo) => {
    try {
        const blYy = new Date().getFullYear().toString();
        const url = `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo`;
        
        console.log(`[API 호출] ${hblNo} (${blYy}) ...`);
        const response = await axios.get(url, {
            params: {
                crkyCn: UNIPASS_API_KEY,
                hblNo: hblNo,
                blYy: blYy
            }
        });
        
        const $ = cheerio.load(response.data, { xmlMode: true });
        const errorCode = $('tCnt').first().text();
        if (errorCode === '-1') {
            const errorMsg = $('ntceInfo').first().text() || '조회 결과가 없습니다.';
            return { currentStatus: errorMsg, itemName: '-', location: '-' };
        }
        
        const currentStatus = ($('csclPrgsStts').first().text() || $('prgsStts').first().text() || '정보 없음').trim();
        const itemName = $('prnm').first().text() || '품명 미확인';
        const location = $('dsprNm').first().text() || '위치 미확인';
        let weight = $('msrm').first().text() || '확인 불가';
        let count = $('pckGcnt').first().text() || '확인 불가';
        
        const shipNm = $('shcoFlNm').first().text() || $('shipNm').first().text() || '확인불가'; 
        const voyageNo = $('vydf').first().text() || '-'; 
        const shipNat = $('shipNatNm').first().text() || $('shipNat').first().text() || '-'; 
        const lodPort = $('ldprNm').first().text() || $('lodPortNm').first().text() || '-';
        const dsprPort = $('dsprNm').first().text() || '-'; 
        const etprDt = $('etprDt').first().text() || '-'; 
        const msrm = $('msrm').first().text() || '-'; 
        const ttwg = $('ttwg').first().text() || '-'; 
        const cntrGcnt = $('cntrGcnt').first().text() || '0'; 

        const mblNo = $('mblNo').first().text() || '-';
        const cargMtNo = $('cargMtNo').first().text() || '-';
        const cargTp = $('cargTp').first().text() || '-';
        const blPtNm = $('blPtNm').first().text() || '-';
        const shcoFlco = $('shcoFlco').first().text() || '-';
        const frwrEntsConm = $('frwrEntsConm').first().text() || '-';
        const cntrNo = $('cntrNo').first().text() || '-';
        const etprCstm = $('etprCstm').first().text() || '-';
        
        weight = ttwg + ' ' + ($('wghtUt').first().text() || 'KG');
        count = ($('pckGcnt').first().text() || '0') + ' ' + ($('pckUt').first().text() || 'PK');

        const formattedEta = etprDt.length === 8 ? `${etprDt.substring(0,4)}-${etprDt.substring(4,6)}-${etprDt.substring(6,8)}` : etprDt;
        const lastDateParts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).split(' ');
        const lastDate = lastDateParts.slice(0, 5).join(' ');

        const stages = [];
        $('cargCsclPrgsInfoDtlQryVo').each((i, el) => {
            const dateStr = $(el).children('prcsDttm').text();
            let dateObj = '-';
            if (dateStr.length >= 14) {
                dateObj = `${dateStr.substring(0,4)}.${dateStr.substring(4,6)}.${dateStr.substring(6,8)} ${dateStr.substring(8,10)}:${dateStr.substring(10,12)}`;
            }
            stages.push({
                date: dateObj,
                title: $(el).children('cargTrcnRelaBsopTpcd').text() || '-',
                desc: $(el).children('shedNm').text() || '-'
            });
        });
        
        // 반환 객체 저장 (action 환경이므로 여기서 파일 쓰기를 직접 하지 않고, 루프에서 변경 감지 후 한 번에 기록함)
        return {
            currentStatus,
            itemName,
            location,
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

    } catch (error) {
        console.error(`[오류] Unipass 연동 실패 (${hblNo}):`, error.message);
        return { currentStatus: '오류', itemName: '-', location: '-' };
    }
};

// --- 메인 깃허브 액션 프로세스 ---
const runGithubAction = async () => {
    console.log("[GitHub Actions] Started background monitor...");

    let blList = [];
    if (fs.existsSync(BL_LIST_PATH)) {
        blList = JSON.parse(fs.readFileSync(BL_LIST_PATH));
    } else {
        console.log("No BL List found to monitor, exiting.");
        return;
    }

    let historyData = {};
    if (fs.existsSync(HISTORY_PATH)) {
        historyData = JSON.parse(fs.readFileSync(HISTORY_PATH));
    }
    
    let hasChanges = false;

    for (const hblNo of blList) {
        try {
            const result = await fetchStatusFromUnipass(hblNo);
            const prevStatus = historyData[hblNo] ? (historyData[hblNo].status || historyData[hblNo]) : null;

            if (result.currentStatus && result.currentStatus !== '정보 없음' && !result.currentStatus.includes('조회 결과')) {
                // 이전 기록과 상태명이 다르면 변경 감지!
                if (result.currentStatus !== prevStatus) {
                    const msg = `🚀 <b>[화물 상태 변경 (GitHub Actions 알림)]</b>\n\n번호: <code>${hblNo}</code>\n품명: ${result.itemName || '-'}\n이전: ${prevStatus || '신규 등록'}\n👉 <b>현재: ${result.currentStatus}</b>\n\n📍 위치: ${result.location || '-'}\n\n<a href="https://unipass.customs.go.kr/csp/index.do">유니패스에서 자세히 보기</a>`;
                    await sendTelegram(msg);
                    hasChanges = true;
                }
                
                // 최신 내역으로 history data 객체 덮어쓰기
                historyData[hblNo] = {
                    status: result.currentStatus,
                    itemName: result.itemName,
                    lastChecked: new Date().toISOString(),
                    lastProcessDate: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                    extra: result.extra
                };
            }
        } catch (e) {
            console.error(e);
        }
        
        // 유니패스 서버 보호를 위해 약간 대기 (2초)
        await new Promise(r => setTimeout(r, 2000));
    }

    // 커밋을 위해 json 형식으로 덮어씀 (GitHub Action yaml 파일 뒷 단락에서 이 파일에 변경이 있다면 commit & push 됨)
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(historyData, null, 2));
    console.log("[GitHub Actions] Monitoring loop successfully completed.");
};

runGithubAction();
